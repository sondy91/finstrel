// Vitest setup file
import { beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock the Wails API
window.go = {
  main: {
    App: {
      GetEnvelopes: vi.fn(),
      CreateEnvelope: vi.fn(),
      UpdateEnvelope: vi.fn(),
      DeleteEnvelope: vi.fn(),
      GetBudgetPeriods: vi.fn(),
      GetBudgetAllocationsByBudgetPeriodID: vi.fn(),
      GetCategories: vi.fn(),
      DeleteBudgetAllocation: vi.fn(),
    },
  },
};

// Mock window.matchMedia which is not implemented in JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Node now exposes its own file-backed Web Storage globals, which older
// Vitest versions retain instead of JSDOM's storage. Keep browser storage
// deterministic and isolated without touching a Node storage file.
class TestStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(String(key)) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(String(key)); }
  setItem(key: string, value: string) { this.values.set(String(key), String(value)); }
}
Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: new TestStorage() });
beforeEach(() => window.localStorage.clear());
