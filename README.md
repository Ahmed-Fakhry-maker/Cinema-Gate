# Cinema Gate

A sleek, full-stack movie browsing website powered by The Movie Database (TMDB) API, complete with movie details, member ratings and reviews, and a personal watchlist.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **Backend:** Node.js + Express (`server.ts`, `src/server/*`)
- **External Movie Data:** TMDB API v3 (`https://api.themoviedb.org/3`) via server-side proxy routes (`src/server/tmdb.ts`)
- **Database:** SQLite (`node:sqlite` `DatabaseSync`) stored in `data/cinema.db` for accounts, member reviews, and watchlists
- **Authentication:** Salted `scrypt` password hashing and HMAC-SHA256 signed `HttpOnly` session cookies (`node:crypto`)
- **Testing:** Node.js native test runner (`tsx --test`)

## Configuring Your TMDB API Key

The TMDB API key placeholder is stored in `.env.example` (and referenced via `TMDB_API_KEY` in `src/server/tmdb.ts`, with placeholder constant `TMDB_API_KEY_PLACEHOLDER = 'YOUR_TMDB_API_KEY'`):

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Replace `YOUR_TMDB_API_KEY` in `.env` with your real TMDB v3 API Key or v4 Read Access Token:
   ```env
   TMDB_API_KEY="YOUR_TMDB_API_KEY"
   ```

Both TMDB authentication formats documented in the TMDB Getting Started guide are supported automatically:
- **v4 Read Access Token (JWT):** sent via `Authorization: Bearer <token>`
- **v3 API Key:** sent via `?api_key=<key>`

## Running Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server (API + Vite frontend on port 3000):**
   ```bash
   npm run dev
   ```

3. **Run the automated tests:**
   ```bash
   npm test
   ```

4. **Build and run in production:**
   ```bash
   npm run build
   npm start
   ```
