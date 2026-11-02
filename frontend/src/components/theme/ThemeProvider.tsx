import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = 'vestra-theme';
const ACCENT_STORAGE_KEY = 'vestra-accent';

const prefersDark = () => {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const readInitialTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return prefersDark() ? 'dark' : 'light';
};

const readInitialAccent = (): string => {
  if (typeof window === 'undefined') {
    return 'indigo';
  }
  return window.localStorage.getItem(ACCENT_STORAGE_KEY) || 'indigo';
};

const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
};

const ACCENT_COLORS: Record<string, { hsl: string; rgb: string }> = {
  indigo: { hsl: '239 84% 67%', rgb: '99 102 241' },
  blue: { hsl: '217 91% 60%', rgb: '59 130 246' },
  green: { hsl: '160 84% 39%', rgb: '16 185 129' },
  purple: { hsl: '271 81% 56%', rgb: '168 85 247' },
  pink: { hsl: '330 81% 60%', rgb: '236 72 153' },
  gold: { hsl: '37 48% 34%', rgb: '128 96 45' },
};

const applyAccent = (color: string, theme: Theme) => {
  if (typeof document === 'undefined') {
    return;
  }
  const accent =
    color === 'gold' && theme === 'dark'
      ? { hsl: '38 67% 69%', rgb: '229 191 123' }
      : ACCENT_COLORS[color] || ACCENT_COLORS.indigo;
  const root = document.documentElement;
  root.style.setProperty('--primary', accent.hsl);
  root.style.setProperty('--primary-rgb', accent.rgb);
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initialTheme = readInitialTheme();
    applyTheme(initialTheme);
    return initialTheme;
  });

  const [accentColor, setAccentColorState] = useState<string>(() => {
    const initialAccent = readInitialAccent();
    applyAccent(initialAccent, readInitialTheme());
    return initialAccent;
  });

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    applyAccent(accentColor, theme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, accentColor);
    }
  }, [accentColor, theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const setAccentColor = useCallback((color: string) => {
    setAccentColorState(color);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, accentColor, setAccentColor }),
    [theme, setTheme, accentColor, setAccentColor]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
