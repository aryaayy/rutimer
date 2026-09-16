# rutimer

Vue 3 Rubik's Cube timer with WCA scrambles, sessions, statistics, local persistence, optional Firebase accounts, and cloud solve sync.

## Run locally

```bash
npm install
npm run dev
```

The app works without Firebase and stores data in the browser. To enable accounts and cloud sync:

1. Create a Firebase web app.
2. Enable Email/Password under Authentication.
3. Enable Google under Authentication > Sign-in providers.
4. Add your development and production domains under Authentication > Settings > Authorized domains.
5. Create a Firestore database.
6. Copy `.env.example` to `.env.local` and fill in the Firebase web configuration values.
7. Add Firestore rules that restrict each user to their own session metadata and solves:

```text
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /users/{userId}/solves/{solveId} {
			allow read, write: if request.auth != null && request.auth.uid == userId;
		}
		match /users/{userId}/sessions/{sessionId} {
			allow read, write: if request.auth != null && request.auth.uid == userId;
		}
	}
}
```

Do not commit `.env.local` or any private server credentials.

Deploy the rules from the project root with:

```bash
firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```
# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).
