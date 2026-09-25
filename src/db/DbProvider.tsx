import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { attachGolfApiCachePersist } from '../course/golfapi';
import { attachCoursePaintCachePersist } from '../course/paintCache';
import { startPurchases } from '../services/purchases';
import { migrate } from './schema';
import {
  getCoursePaintCache,
  getGolfApiHydrateCache,
  setCoursePaintCache,
  setGolfApiHydrateCache,
} from './repo';
import { colors } from '../ui/theme';

type DbContextValue = {
  db: SQLiteDatabase;
  revision: number;
  bump: () => void;
};

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    try {
      const opened = SQLite.openDatabaseSync('shottrax.db');
      migrate(opened);
      attachGolfApiCachePersist({
        load: () => getGolfApiHydrateCache(opened),
        save: (json) => setGolfApiHydrateCache(opened, json),
      });
      attachCoursePaintCachePersist({
        load: () => getCoursePaintCache(opened),
        save: (json) => setCoursePaintCache(opened, json),
      });
      // Hydrates the Pro cache before the first screen, then refreshes from RevenueCat.
      startPurchases(opened);
      setDb(opened);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open database');
    }
  }, []);

  const bump = useCallback(() => setRevision((n) => n + 1), []);
  const value = useMemo(
    () => (db ? { db, revision, bump } : null),
    [db, revision, bump],
  );

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.red, fontSize: 18 }}>{error}</Text>
      </View>
    );
  }

  if (!value) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.lime} size="large" />
      </View>
    );
  }

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) {
    throw new Error('useDb must be used inside DbProvider');
  }
  return ctx;
}
