import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_BAG } from '../domain/defaultBag';

export function migrate(db: SQLiteDatabase): void {
  db.execSync('PRAGMA foreign_keys = ON;');
  db.execSync(`
    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      loft_rank INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      course_name TEXT,
      hole_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holes (
      id TEXT PRIMARY KEY NOT NULL,
      round_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      par INTEGER NOT NULL,
      score INTEGER,
      FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shots (
      id TEXT PRIMARY KEY NOT NULL,
      hole_id TEXT NOT NULL,
      club_id TEXT,
      seq INTEGER NOT NULL,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      start_accuracy_m REAL,
      start_fix_quality TEXT NOT NULL,
      end_lat REAL,
      end_lng REAL,
      end_accuracy_m REAL,
      end_fix_quality TEXT,
      distance_yards INTEGER,
      fix_quality TEXT NOT NULL,
      impossible_jump INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (hole_id) REFERENCES holes(id) ON DELETE CASCADE,
      FOREIGN KEY (club_id) REFERENCES clubs(id)
    );
  `);

  const clubCount = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM clubs');
  if ((clubCount?.n ?? 0) === 0) {
    const insert = db.prepareSync(
      'INSERT INTO clubs (id, name, short_name, loft_rank, sort_order, enabled) VALUES (?, ?, ?, ?, ?, 1)',
    );
    try {
      for (const club of DEFAULT_BAG) {
        insert.executeSync([club.id, club.name, club.shortName, club.loftRank, club.sortOrder]);
      }
    } finally {
      insert.finalizeSync();
    }
  }
}
