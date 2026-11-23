import 'dotenv/config';
import { createDatabase } from '../src/server/db.ts';
import { createFirestoreWatchlistStore, migrateSqliteWatchlist } from '../src/server/watchlist.ts';

// Usage: npm run migrate:watchlist  (needs Firestore credentials; see src/server/watchlist.ts)
const { copied, skipped } = await migrateSqliteWatchlist(createDatabase(), createFirestoreWatchlistStore());
console.log(`Watchlist migration done: ${copied} copied, ${skipped} skipped (user has no Firebase uid).`);
