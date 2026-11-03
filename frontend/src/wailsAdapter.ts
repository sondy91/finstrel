import { getPracticeSession } from './lib/practice';
// A thin adapter over Wails-generated functions that also falls back to window.go.main.App
// This stabilizes imports in tests and in environments where the generated module may not be ready.

// Import the generated Wails bindings if available in the build context
// The path is relative to src/: ../wailsjs/go/main/App
import * as WailsApp from '../wailsjs/go/main/App';

// Helper to call either window.go.main.App or the imported Wails module
const call =
  (fnName: string) =>
  async (...args: any[]) => {
    const practice = getPracticeSession();
    if (practice) return await practice.call(fnName, args);
    const winApp = (globalThis as any)?.go?.main?.App;
    if (winApp && typeof winApp[fnName] === 'function') {
      return await winApp[fnName](...args);
    }
    const modFn = (WailsApp as any)[fnName];
    if (typeof modFn === 'function') {
      return await modFn(...args);
    }
    throw new Error(`Wails adapter: function not available: ${fnName}`);
  };

// Export the specific functions currently used by the app
export const GetAccounts = call('GetAccounts');
export const GetTransactions = call('GetTransactions');
export const GetCategories = call('GetCategories');
export const AddCategory = call('AddCategory');
export const AddCategoryWithDefault = call('AddCategoryWithDefault');
export const DeleteCategory = call('DeleteCategory');
export const UpdateCategoryDefaultAmount = call('UpdateCategoryDefaultAmount');
export const UpdateCategory = call('UpdateCategory');
export const AddAccount = call('AddAccount');
export const DeleteAccount = call('DeleteAccount');
export const UpdateAccountCashFlowInclusion = call('UpdateAccountCashFlowInclusion');
export const AddTransaction = call('AddTransaction');
export const GetBills = call('GetBills');
export const AddBill = call('AddBill');
export const UpdateBill = call('UpdateBill');
export const DeleteBill = call('DeleteBill');
export const GetCashFlowSettings = call('GetCashFlowSettings');
export const UpdateCashFlowSettings = call('UpdateCashFlowSettings');
export const GetCashFlowSummary = call('GetCashFlowSummary');

export const GetBudgetPeriods = call('GetBudgetPeriods');
export const AddBudgetPeriod = call('AddBudgetPeriod');
export const UpdateBudgetPeriod = call('UpdateBudgetPeriod');
export const PopulateBudgetPeriodFromDefaults = call('PopulateBudgetPeriodFromDefaults');
export const CloseAndCreateBudgetPeriod = call('CloseAndCreateBudgetPeriod');

export const GetBudgetAllocationsByBudgetPeriodID = call('GetBudgetAllocationsByBudgetPeriodID');
export const AddBudgetAllocation = call('AddBudgetAllocation');
export const UpdateBudgetAllocation = call('UpdateBudgetAllocation');
export const DeleteBudgetAllocation = call('DeleteBudgetAllocation');

// Envelope-related (future-proof)
export const CreateEnvelope = call('CreateEnvelope');

// Data management
export const ClearAllData = call('ClearAllData');

// Optional bank feeds: all provider calls and credentials stay in Go.
export const GetBankFeedView = call('GetBankFeedView');
export const SetBankTransactionCategory = call('SetBankTransactionCategory');
export const SetBankTransactionExcluded = call('SetBankTransactionExcluded');
export const StartBankLink = call('StartBankLink');
export const FinishBankLink = call('FinishBankLink');
export const ImportBankFeeds = call('ImportBankFeeds');
export const ImportBankFeed = call('ImportBankFeed');

export const DisconnectBankFeed = call('DisconnectBankFeed');
export const CancelBankLink = call('CancelBankLink');

export const GetIncomeSchedules = call('GetIncomeSchedules');
export const SaveIncomeSchedule = call('SaveIncomeSchedule');
export const SaveBillSchedule = call('SaveBillSchedule');
export const GetPlanningCalendar = call('GetPlanningCalendar');
export const PreviewBudgetWindow = call('PreviewBudgetWindow');
export const UpdateBudgetPeriodStatus = call('UpdateBudgetPeriodStatus');
export const GetBudgetReview = call('GetBudgetReview');
