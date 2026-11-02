import {
  Car,
  Film,
  Home,
  MoonStar,
  Shield,
  ShoppingBag,
  Target,
  FileText,
  Sparkles,
  SunMedium,
  CreditCard,
  Info,
} from 'lucide-react';
import { useState } from 'react';

import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import BrandMark from '@/components/BrandMark';
import BankConnectionsPanel from '@/components/BankConnectionsPanel';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Steps } from '@/components/ui/steps';
import { saveOnboardingData } from '@/lib/onboarding';

type WelcomePageProps = {
  onGetStarted: () => void;
  onPractice?: () => void;
};
type OnboardingData = {
  accentColor: string;
  themeMode: 'light' | 'dark';
  goals: string[];
  categories: string[];
  defaultAmounts: Record<string, number>;
};

const LogoMark = () => <BrandMark className="mx-auto mb-6 h-32 w-32" />;

export default function WelcomePage({ onGetStarted, onPractice }: WelcomePageProps) {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const [currentStep, setCurrentStep] = useState(1);
  const [withPartner, setWithPartner] = useState<boolean | null>(null);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    accentColor,
    themeMode: theme,
    goals: [],
    categories: [],
    defaultAmounts: {},
  });
  // Keep amount entry as text so a controlled number input can be cleared
  // before it is normalized to a safe value on completion.
  const [defaultAmountDrafts, setDefaultAmountDrafts] = useState<Record<string, string>>({});

  const goalOptions = [
    { id: 'debt', label: 'Pay off debt', Icon: CreditCard },
    { id: 'emergency', label: 'Build an emergency fund', Icon: Shield },
    { id: 'savings', label: 'Save for a goal', Icon: Target },
    { id: 'budget', label: 'Create a budget', Icon: FileText },
    { id: 'other', label: 'Something else', Icon: Sparkles },
  ];

  const toggleGoal = (goalId: string) => {
    setOnboardingData((prev) => ({
      ...prev,
      goals: prev.goals.includes(goalId)
        ? prev.goals.filter((g) => g !== goalId)
        : [...prev.goals, goalId],
    }));
  };

  const starterCategories = [
    { id: 'groceries', label: 'Groceries', Icon: ShoppingBag },
    { id: 'rent', label: 'Rent/Mortgage', Icon: Home },
    { id: 'utilities', label: 'Utilities', Icon: Sparkles },
    { id: 'transportation', label: 'Transportation', Icon: Car },
    { id: 'entertainment', label: 'Entertainment', Icon: Film },
    { id: 'savings', label: 'Savings', Icon: Target },
  ];

  const toggleCategory = (categoryId: string) => {
    setOnboardingData((prev) => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter((c) => c !== categoryId)
        : [...prev.categories, categoryId],
      defaultAmounts: prev.categories.includes(categoryId)
        ? Object.fromEntries(
            Object.entries(prev.defaultAmounts).filter(([id]) => id !== categoryId)
          )
        : { ...prev.defaultAmounts, [categoryId]: 0 },
    }));
    setDefaultAmountDrafts((prev) => {
      if (onboardingData.categories.includes(categoryId)) {
        const { [categoryId]: _removed, ...remaining } = prev;
        return remaining;
      }
      return { ...prev, [categoryId]: '' };
    });
  };

  const labels = [
    'Welcome',
    'Customize',
    'Goals',
    'About you',
    ...(withPartner ? ['Partner'] : []),
    'Categories',
    'Amounts',
    'Connect accounts',
  ];
  const steps = labels.map((label, index) => ({ id: index + 1, label }));
  const step = labels[currentStep - 1];

  const canProceed = () => {
    if (step === 'Goals' && onboardingData.goals.length === 0) {
      return false;
    }
    if (step === 'Categories' && onboardingData.categories.length === 0) {
      return false;
    }
    if (step === 'About you' && withPartner === null) return false;
    return true;
  };

  const handleNext = () => {
    if (!canProceed()) {
      return;
    }
    if (currentStep < steps.length) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Save onboarding data before completing
      const completedData: OnboardingData = {
        ...onboardingData,
        defaultAmounts: Object.fromEntries(
          onboardingData.categories.map((categoryId) => {
            const amount = Number(defaultAmountDrafts[categoryId]);
            return [categoryId, Number.isFinite(amount) && amount >= 0 ? amount : 0];
          })
        ),
      };
      saveOnboardingData(completedData);
      onGetStarted();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),_transparent_60%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
        {/* <header className="flex items-center justify-between">
          <span className="text-lg font-semibold tracking-wide text-muted-foreground">Finstrel</span>
        </header> */}
        <main className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-2xl border-border/70 bg-card/80 backdrop-blur">
            <CardHeader className="space-y-4 text-center">
              <LogoMark />
              {step === 'Welcome' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">Welcome to Finstrel</h1>
                  <p className="text-base text-muted-foreground">
                    Plan budgets and track envelopes on your device. Optional bank imports use
                    Plaid.
                  </p>
                </div>
              )}
              {step === 'Customize' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">
                    Customize your experience
                  </h1>
                  <p className="text-base text-muted-foreground">
                    Choose an accent color and theme mode that suits your style.
                  </p>
                </div>
              )}
              {step === 'Goals' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">What are your goals?</h1>
                  <p className="text-base text-muted-foreground">
                    Select all that apply to personalize your experience.
                  </p>
                </div>
              )}
              {step === 'About you' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">Tell us about yourself</h1>
                  <p className="text-base text-muted-foreground">Let's set up your household.</p>
                </div>
              )}
              {step === 'Partner' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">Plan together</h1>
                  <p className="text-base text-muted-foreground">
                    Your household can use Finstrel together on this device.
                  </p>
                </div>
              )}
              {step === 'Connect accounts' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">Connect an account</h1>
                  <p className="text-base text-muted-foreground">
                    Optionally connect a bank to explore your accounts and transactions.
                  </p>
                </div>
              )}
              {step === 'Categories' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">
                    Choose starter categories
                  </h1>
                  <p className="text-base text-muted-foreground">
                    Select categories to help build your first budget.
                  </p>
                </div>
              )}
              {step === 'Amounts' && (
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight">Set your usual amounts</h1>
                  <p className="text-base text-muted-foreground">
                    These defaults will be used for your first and future budget periods.
                  </p>
                </div>
              )}
            </CardHeader>
            <CardContent className="flex flex-col min-h-[420px]">
              <div className="flex-1 flex flex-col items-center justify-center">
                {step === 'Welcome' && (
                  <div className="text-center">
                    <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                      See how a two-week budget works before entering your own numbers.
                    </p>
                    {onPractice && (
                      <Button variant="outline" onClick={onPractice}>
                        Try a practice household
                      </Button>
                    )}
                  </div>
                )}
                {step === 'Customize' && (
                  <div className="w-full">
                    <div className="space-y-3">
                      <label className="block text-sm text-center font-medium">Accent color</label>
                      <div className="flex gap-3 justify-center">
                        {['indigo', 'blue', 'green', 'purple', 'pink', 'gold'].map((color) => (
                          <button
                            key={color}
                            onClick={() => {
                              setOnboardingData({ ...onboardingData, accentColor: color });
                              setAccentColor(color);
                            }}
                            className={`h-10 w-10 rounded-full transition-all ${
                              onboardingData.accentColor === color
                                ? 'ring-2 ring-offset-2 ring-primary scale-110'
                                : 'hover:scale-105'
                            }`}
                            style={{
                              backgroundColor:
                                color === 'indigo'
                                  ? '#6366f1'
                                  : color === 'blue'
                                    ? '#3b82f6'
                                    : color === 'green'
                                      ? '#10b981'
                                      : color === 'purple'
                                        ? '#a855f7'
                                        : color === 'pink'
                                          ? '#ec4899'
                                          : '#a88656',
                            }}
                            aria-label={`Select ${color} accent`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3 mt-6">
                      <label className="block text-sm text-center font-medium">Theme mode</label>
                      <div className="flex gap-3 justify-center">
                        <Button
                          variant={onboardingData.themeMode === 'light' ? 'default' : 'outline'}
                          onClick={() => {
                            setOnboardingData({ ...onboardingData, themeMode: 'light' });
                            setTheme('light');
                          }}
                          className="min-w-[120px]"
                        >
                          <SunMedium className="mr-2 h-4 w-4" />
                          Light
                        </Button>
                        <Button
                          variant={onboardingData.themeMode === 'dark' ? 'default' : 'outline'}
                          onClick={() => {
                            setOnboardingData({ ...onboardingData, themeMode: 'dark' });
                            setTheme('dark');
                          }}
                          className="min-w-[120px]"
                        >
                          <MoonStar className="mr-2 h-4 w-4" />
                          Dark
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {step === 'Goals' && (
                  <div className="w-full max-w-md">
                    <div className="grid grid-cols-1 gap-3">
                      {goalOptions.map((goal) => {
                        const isSelected = onboardingData.goals.includes(goal.id);
                        const IconComponent = goal.Icon;
                        return (
                          <button
                            key={goal.id}
                            onClick={() => toggleGoal(goal.id)}
                            className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors min-h-[60px] ${
                              isSelected
                                ? 'border-primary bg-primary/10 shadow-sm'
                                : 'border-border hover:border-primary/50 hover:bg-accent/50'
                            }`}
                            aria-label={`Select goal: ${goal.label}`}
                          >
                            <IconComponent className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                            <span className="flex-1 font-medium">{goal.label}</span>
                            <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                              {isSelected && <span className="text-primary text-xl">✓</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {step === 'About you' && (
                  <fieldset className="w-full max-w-md space-y-4">
                    <legend className="mb-4 text-center font-medium">
                      Do you manage your finances with a partner?
                    </legend>
                    <div className="grid grid-cols-2 gap-3">
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          aria-pressed={withPartner === value}
                          onClick={() => setWithPartner(value)}
                          className={`rounded-lg border-2 p-4 font-medium ${withPartner === value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                        >
                          {value ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                {step === 'Partner' && (
                  <div className="max-w-md rounded-lg border bg-muted/30 p-5 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Email invitations aren't available yet
                    </p>
                    <p className="mt-2">
                      Finstrel keeps your household on this device. You can continue setting up your
                      budget together.
                    </p>
                  </div>
                )}
                {step === 'Connect accounts' && (
                  <div className="w-full">
                    <BankConnectionsPanel centerControls />
                  </div>
                )}
                {step === 'Categories' && (
                  <div className="w-full max-w-md">
                    <div className="grid grid-cols-2 gap-3">
                      {starterCategories.map((category) => {
                        const isSelected = onboardingData.categories.includes(category.id);
                        const IconComponent = category.Icon;
                        return (
                          <button
                            key={category.id}
                            onClick={() => toggleCategory(category.id)}
                            className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors h-[100px] ${
                              isSelected
                                ? 'border-primary bg-primary/10 shadow-sm'
                                : 'border-border hover:border-primary/50 hover:bg-accent/50'
                            }`}
                            aria-label={`Select category: ${category.label}`}
                          >
                            <div className="flex-1 flex flex-col items-center justify-center gap-2">
                              <IconComponent className="h-6 w-6 flex-shrink-0 text-muted-foreground" />
                              <span className="text-sm font-medium leading-tight">
                                {category.label}
                              </span>
                            </div>
                            <span className="h-5 flex items-center justify-center">
                              {isSelected && <span className="text-primary text-lg">✓</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {step === 'Amounts' && (
                  <div className="w-full max-w-md space-y-3">
                    {onboardingData.categories.map((categoryId) => {
                      const category = starterCategories.find((item) => item.id === categoryId);
                      return (
                        <label
                          key={categoryId}
                          className="flex items-center justify-between gap-4 rounded-lg border p-3"
                        >
                          <span className="font-medium">{category?.label || categoryId}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">$</span>
                            <Input
                              className="w-28"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              value={defaultAmountDrafts[categoryId] ?? ''}
                              onChange={(e) =>
                                setDefaultAmountDrafts((prev) => ({
                                  ...prev,
                                  [categoryId]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </label>
                      );
                    })}
                    <p className="flex items-center justify-center gap-2 pt-2 text-center text-xs text-muted-foreground">
                      <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
                      Leave an amount blank to use $0.
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-auto pt-6 space-y-4">
                <div className="flex gap-3 justify-center">
                  {step === 'Welcome' && (
                    <Button size="lg" className="min-w-[200px]" onClick={handleNext}>
                      Get started
                    </Button>
                  )}
                  {currentStep > 1 && (
                    <>
                      <Button variant="outline" onClick={handleBack}>
                        Back
                      </Button>
                      <Button
                        onClick={handleNext}
                        className="min-w-[120px]"
                        disabled={!canProceed()}
                      >
                        {currentStep === steps.length ? 'Finish setup' : 'Continue'}
                      </Button>
                    </>
                  )}
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  Step {currentStep} of {steps.length} · {step}
                </div>
                <div className="flex justify-center">
                  <Steps steps={steps} current={currentStep} />
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
        <footer className="mt-10 flex justify-center text-xs text-muted-foreground">
          <span>Local budgets • Optional bank imports • Privacy-first</span>
        </footer>
      </div>
    </div>
  );
}
