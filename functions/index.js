/* eslint-disable max-len */
/* eslint-disable no-unused-vars */
/* eslint-disable comma-dangle */
/* eslint-disable object-curly-spacing */
/* eslint-disable indent */
/* eslint-disable quotes */
/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
// const {onDocumentCreated} = require("firebase-functions/v2/firestore");

// The Firebase Admin SDK to access Firestore.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const dbRef = admin.firestore().doc('tokens/demo');

const TwitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: 'CLIENT_ID',
  clientSecret: 'CLIENT_SECRET',
});

const callbackUrl =
  'https://us-central1-xbot-a5127.cloudfunctions.net/callback';

const { OpenAI } = require('openai');
const openai = new OpenAI({
  apiKey: 'API_KEY',
});

exports.auth = functions.https.onRequest(async (request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackUrl,
    { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
  );

  await dbRef.set({ codeVerifier, state });

  response.redirect(url);
});

exports.callback = functions.https.onRequest(async (request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = await dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  console.log(codeVerifier);
  console.log(storedState);

  if (state !== storedState) {
    return response.status(400).send('Stored tokens do not match!');
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackUrl,
  });

  await dbRef.set({ accessToken, refreshToken });

  const nextTweet = await openai.chat.completions.create({
    messages: [
      {
        role: 'user',
        content:
          'Write a tweet that is inspirational and motivating. Keep it under 280 characters. Dont include "#MotivationMonday"',
      },
    ],
    model: 'gpt-3.5-turbo',
  });
  console.log(nextTweet.choices[0].message.content);

  const { data } = await loggedClient.v2.tweet(
    nextTweet.choices[0].message.content
  );

  response.send(data);
});

exports.tweet = functions.https.onRequest(async (request, response) => {
  const { refreshToken } = (await dbRef.get()).data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(refreshToken);

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const nextTweet = await openai.chat.completions.create({
    messages: [
      {
        role: 'user',
        content:
          'Write a tweet that is inspirational and motivating. Keep it under 280 characters. Include 3hashtags, but none of them can be "#MotivationMonday"',
      },
    ],
    model: 'gpt-3.5-turbo',
  });
  console.log(nextTweet.choices[0].message.content);

  const { data } = await refreshedClient.v2.tweet(
    nextTweet.choices[0].message.content
  );

  response.send(data);
});
