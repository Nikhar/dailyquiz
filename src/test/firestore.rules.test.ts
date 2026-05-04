import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { describe, it, beforeEach, afterAll, expect } from 'vitest';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-rules-test-' + Date.now(),
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should allow user to update their score by <= 15 points', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const db = alice.firestore();
    
    // Create initial profile
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'alice'), {
        username: 'alice',
        score: 10,
        notif_opt_in: false
      });
    });

    // Attempt valid update
    await expect(
      updateDoc(doc(db, 'users', 'alice'), {
        score: 25,
        last_solved_at: '2026-05-04'
      })
    ).resolves.toBeUndefined();
  });

  it('should deny user from updating their score by > 15 points', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const db = alice.firestore();
    
    // Create initial profile
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'alice'), {
        username: 'alice',
        score: 10,
        notif_opt_in: false
      });
    });

    // Attempt invalid update (Score jump of 100 points)
    await expect(
      updateDoc(doc(db, 'users', 'alice'), {
        score: 110,
        last_solved_at: '2026-05-04'
      })
    ).rejects.toThrow();
  });

  it('should deny user from solving a quiz twice on the same day in a challenge leaderboard', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const db = alice.firestore();
    
    // Create initial leaderboard doc for Day 1
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges/challenge1/leaderboard', 'alice'), {
        username: 'alice',
        score: 10,
        last_solved_at: '2026-05-04'
      });
    });

    // Attempt duplicate write on the same day '2026-05-04'
    await expect(
      setDoc(doc(db, 'challenges/challenge1/leaderboard', 'alice'), {
        username: 'alice',
        score: 25,
        last_solved_at: '2026-05-04'
      }, { merge: true })
    ).rejects.toThrow();
  });

  it('should allow user to solve quiz on a new day in a challenge leaderboard', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const db = alice.firestore();
    
    // Create initial leaderboard doc for Day 1
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges/challenge1/leaderboard', 'alice'), {
        username: 'alice',
        score: 10,
        last_solved_at: '2026-05-04'
      });
    });

    // Attempt valid write on a new day '2026-05-05'
    await expect(
      setDoc(doc(db, 'challenges/challenge1/leaderboard', 'alice'), {
        username: 'alice',
        score: 25,
        last_solved_at: '2026-05-05'
      }, { merge: true })
    ).resolves.toBeUndefined();
  });

  it('should allow user to update their currentStreak and maxStreak fields', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const db = alice.firestore();
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'alice'), {
        username: 'alice',
        score: 10,
        currentStreak: 0,
        maxStreak: 0
      });
    });

    await expect(
      updateDoc(doc(db, 'users', 'alice'), {
        score: 20,
        last_solved_at: '2026-05-04',
        currentStreak: 1,
        maxStreak: 1
      })
    ).resolves.toBeUndefined();
  });
});
