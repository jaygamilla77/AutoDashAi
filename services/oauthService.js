'use strict';

/**
 * Real OAuth via Passport — Google + Microsoft.
 *
 * Strategies are only registered when their env vars are populated, so the
 * site keeps working out-of-the-box for self-hosters without OAuth credentials.
 *
 * Use:
 *   const oauth = require('./services/oauthService');
 *   oauth.init();          // call once at boot
 *   oauth.isEnabled('google') // → boolean
 *   app.use(oauth.middleware());
 *   app.get('/auth/google', oauth.start('google'));
 *   app.get('/auth/google/callback', oauth.callback('google', onUser));
 */
const passport = require('passport');

let GoogleStrategy = null;
let MicrosoftStrategy = null;
try { GoogleStrategy    = require('passport-google-oauth20').Strategy; } catch (_) {}
try { MicrosoftStrategy = require('passport-microsoft').Strategy;       } catch (_) {}

const enabled = { google: false, microsoft: false };

function siteOrigin() {
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/$/, '');
  return 'http://localhost:' + (process.env.PORT || '3000');
}

function init() {
  // Passport stores nothing on the session for our flow — we just use it as a
  // request-scoped strategy runner. serializeUser/deserializeUser are still
  // required by passport even when sessions are disabled.
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  // Google
  if (GoogleStrategy && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use('google', new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: siteOrigin() + '/auth/google/callback',
      scope: ['profile', 'email'],
    }, (accessToken, refreshToken, profile, done) => {
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
      const photo = (profile.photos && profile.photos[0] && profile.photos[0].value) || null;
      done(null, {
        provider: 'google',
        providerUserId: profile.id,
        email,
        name: profile.displayName || (email ? email.split('@')[0] : 'Google User'),
        avatarUrl: photo,
      });
    }));
    enabled.google = true;
    console.log('[OAuth] Google strategy registered.');
  } else {
    console.log('[OAuth] Google disabled (set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to enable).');
  }

  // Microsoft (Azure AD / Entra)
  if (MicrosoftStrategy && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    passport.use('microsoft', new MicrosoftStrategy({
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: siteOrigin() + '/auth/microsoft/callback',
      scope: ['user.read'],
      tenant: process.env.MICROSOFT_TENANT || 'common',
    }, (accessToken, refreshToken, profile, done) => {
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value)
                  || profile._json?.mail
                  || profile._json?.userPrincipalName
                  || null;
      done(null, {
        provider: 'microsoft',
        providerUserId: profile.id,
        email,
        name: profile.displayName || (email ? email.split('@')[0] : 'Microsoft User'),
        avatarUrl: null,
      });
    }));
    enabled.microsoft = true;
    console.log('[OAuth] Microsoft strategy registered.');
  } else {
    console.log('[OAuth] Microsoft disabled (set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET to enable).');
  }
}

function isEnabled(provider) { return !!enabled[provider]; }
function middleware()        { return passport.initialize(); }
function start(provider, opts) {
  // Pass `state` so we can carry plan/next through OAuth round-trip
  return passport.authenticate(provider, Object.assign({ session: false }, opts || {}));
}
/**
 * onUser(user, req, res, next) is invoked with the resolved profile.
 * It is responsible for upserting the User row and setting auth cookies.
 */
function callback(provider, onUser) {
  return (req, res, next) => {
    passport.authenticate(provider, { session: false }, (err, profile) => {
      if (err)     return next(err);
      if (!profile) return res.redirect('/auth?error=' + encodeURIComponent('OAuth was cancelled.'));
      Promise.resolve()
        .then(() => onUser(profile, req, res, next))
        .catch(next);
    })(req, res, next);
  };
}

module.exports = { init, isEnabled, middleware, start, callback };
