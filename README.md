# Twofold

A private, real-time chat for two people, built with Expo, React Native, and Supabase.

## Set up Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql). It creates the two-member room, profile, and message tables; Row Level Security policies; the private image bucket; and the Realtime publication entries.
3. In **Authentication → Providers → Email**, enable email/password sign-in and turn **Confirm email** off. The app creates private, non-deliverable email identifiers so no email address is needed; confirmation must be disabled for the three-field sign-in flow to receive a session.
4. In **Realtime → Settings**, turn off **Allow public access** so the room-scoped policies in the SQL script protect typing and presence channels.
5. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or the project's publishable key). Never put a `service_role` key in the app.
6. Start the app:

   ```sh
   npm install
   npx expo start
   ```

One person creates the room and shares the generated invite code. The other person enters that code, then both set up with their own name, birthday, and 6–12 digit PIN. Supabase Auth stores the PIN as the account password; the app keeps the session in SecureStore on iOS/Android and browser storage on web. A room identifier is also saved locally so returning users can sign in with just the three fields; a new device needs the room invite code during its first setup.

## Chat features

- Supabase Realtime messages, typing broadcasts, and presence-based online status
- Per-member read receipts
- Private Storage image uploads with short-lived signed display URLs
- Row Level Security limits each room to its two authenticated members

## Security notes

The invite code is randomly generated and only its SHA-256 hash is stored. The database enforces a two-member maximum and protects room data with RLS. Birthdays are profile data, not a secret or a substitute for the PIN. A 6-digit PIN has limited resistance to guessing; use a longer PIN and configure appropriate Supabase Auth rate limits before production. Messages are protected in transit and by database access policies, but are **not end-to-end encrypted**—the Supabase project can access stored message content.
