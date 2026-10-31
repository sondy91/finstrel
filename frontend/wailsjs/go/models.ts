export namespace bankfeed {

	export class APR {
	    percent?: number;
	    kind: string;

	    static createFrom(source: any = {}) {
	        return new APR(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.percent = source["percent"];
	        this.kind = source["kind"];
	    }
	}
	export class Account {
	    id: string;
	    name: string;
	    mask: string;
	    type: string;
	    subtype: string;
	    currency: string;
	    current?: number;
	    available?: number;
	    limit?: number;

	    static createFrom(source: any = {}) {
	        return new Account(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.mask = source["mask"];
	        this.type = source["type"];
	        this.subtype = source["subtype"];
	        this.currency = source["currency"];
	        this.current = source["current"];
	        this.available = source["available"];
	        this.limit = source["limit"];
	    }
	}
	export class Holding {
	    accountId: string;
	    securityId: string;
	    name: string;
	    ticker: string;
	    currency: string;
	    quantity: number;
	    value: number;

	    static createFrom(source: any = {}) {
	        return new Holding(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accountId = source["accountId"];
	        this.securityId = source["securityId"];
	        this.name = source["name"];
	        this.ticker = source["ticker"];
	        this.currency = source["currency"];
	        this.quantity = source["quantity"];
	        this.value = source["value"];
	    }
	}
	export class InvestmentTransaction {
	    id: string;
	    accountId: string;
	    date: string;
	    description: string;
	    type: string;
	    currency: string;
	    amount: number;
	    quantity: number;

	    static createFrom(source: any = {}) {
	        return new InvestmentTransaction(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.accountId = source["accountId"];
	        this.date = source["date"];
	        this.description = source["description"];
	        this.type = source["type"];
	        this.currency = source["currency"];
	        this.amount = source["amount"];
	        this.quantity = source["quantity"];
	    }
	}
	export class Liability {
	    accountId: string;
	    kind: string;
	    minimumPayment?: number;
	    nextPaymentDate: string;
	    aprs: APR[];

	    static createFrom(source: any = {}) {
	        return new Liability(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accountId = source["accountId"];
	        this.kind = source["kind"];
	        this.minimumPayment = source["minimumPayment"];
	        this.nextPaymentDate = source["nextPaymentDate"];
	        this.aprs = this.convertValues(source["aprs"], APR);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Transaction {
	    id: string;
	    accountId: string;
	    date: string;
	    description: string;
	    currency: string;
	    category: string;
	    amount: number;
	    pending: boolean;

	    static createFrom(source: any = {}) {
	        return new Transaction(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.accountId = source["accountId"];
	        this.date = source["date"];
	        this.description = source["description"];
	        this.currency = source["currency"];
	        this.category = source["category"];
	        this.amount = source["amount"];
	        this.pending = source["pending"];
	    }
	}
	export class Item {
	    id: string;
	    institution: string;
	    status: string;
	    lastImported: string;
	    notice: string;
	    accounts: Account[];
	    transactions: Transaction[];
	    liabilities: Liability[];
	    holdings: Holding[];
	    investmentTransactions: InvestmentTransaction[];

	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.institution = source["institution"];
	        this.status = source["status"];
	        this.lastImported = source["lastImported"];
	        this.notice = source["notice"];
	        this.accounts = this.convertValues(source["accounts"], Account);
	        this.transactions = this.convertValues(source["transactions"], Transaction);
	        this.liabilities = this.convertValues(source["liabilities"], Liability);
	        this.holdings = this.convertValues(source["holdings"], Holding);
	        this.investmentTransactions = this.convertValues(source["investmentTransactions"], InvestmentTransaction);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}


	export class View {
	    configured: boolean;
	    environment: string;
	    pendingSession: string;
	    items: Item[];

	    static createFrom(source: any = {}) {
	        return new View(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.configured = source["configured"];
	        this.environment = source["environment"];
	        this.pendingSession = source["pendingSession"];
	        this.items = this.convertValues(source["items"], Item);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace models {

	export class Account {
	    id: number;
	    name: string;
	    type: string;
	    initialBalance: number;
	    currentBalance: number;
	    includeInCashFlow: boolean;

	    static createFrom(source: any = {}) {
	        return new Account(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.initialBalance = source["initialBalance"];
	        this.currentBalance = source["currentBalance"];
	        this.includeInCashFlow = source["includeInCashFlow"];
	    }
	}
	export class Bill {
	    schedule: schedule.Rule;
	    id: number;
	    name: string;
	    amount: number;
	    categoryId: number;
	    dueDay: number;
	    accountId?: number;
	    active: boolean;

	    static createFrom(source: any = {}) {
	        return new Bill(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schedule = this.convertValues(source["schedule"], schedule.Rule);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.amount = source["amount"];
	        this.categoryId = source["categoryId"];
	        this.dueDay = source["dueDay"];
	        this.accountId = source["accountId"];
	        this.active = source["active"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BudgetAllocation {
	    id: number;
	    categoryId: number;
	    allocatedAmount: number;
	    budgetPeriodId: number;

	    static createFrom(source: any = {}) {
	        return new BudgetAllocation(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.categoryId = source["categoryId"];
	        this.allocatedAmount = source["allocatedAmount"];
	        this.budgetPeriodId = source["budgetPeriodId"];
	    }
	}
	export class BudgetPeriod {
	    id: number;
	    name: string;
	    // Go type: time
	    startDate: any;
	    // Go type: time
	    endDate: any;
	    status: string;

	    static createFrom(source: any = {}) {
	        return new BudgetPeriod(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.startDate = this.convertValues(source["startDate"], null);
	        this.endDate = this.convertValues(source["endDate"], null);
	        this.status = source["status"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReviewTransaction {
	    date: string;
	    institution: string;
	    description: string;
	    category: string;
	    currency: string;
	    amount: number;
	    pending: boolean;

	    static createFrom(source: any = {}) {
	        return new ReviewTransaction(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.institution = source["institution"];
	        this.description = source["description"];
	        this.category = source["category"];
	        this.currency = source["currency"];
	        this.amount = source["amount"];
	        this.pending = source["pending"];
	    }
	}
	export class BudgetReview {
	    manualCount: number;
	    manualPending: number;
	    manualExpenses: number;
	    plannedExpenses: number;
	    importedCount: number;
	    importedPending: number;
	    importedExpensesUSD: number;
	    environment: string;
	    bankNotice: string;
	    imported: ReviewTransaction[];

	    static createFrom(source: any = {}) {
	        return new BudgetReview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.manualCount = source["manualCount"];
	        this.manualPending = source["manualPending"];
	        this.manualExpenses = source["manualExpenses"];
	        this.plannedExpenses = source["plannedExpenses"];
	        this.importedCount = source["importedCount"];
	        this.importedPending = source["importedPending"];
	        this.importedExpensesUSD = source["importedExpensesUSD"];
	        this.environment = source["environment"];
	        this.bankNotice = source["bankNotice"];
	        this.imported = this.convertValues(source["imported"], ReviewTransaction);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BudgetWindow {
	    start: string;
	    end: string;

	    static createFrom(source: any = {}) {
	        return new BudgetWindow(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.start = source["start"];
	        this.end = source["end"];
	    }
	}
	export class CalendarEvent {
	    date: string;
	    kind: string;
	    sourceId: number;
	    name: string;
	    amount: number;

	    static createFrom(source: any = {}) {
	        return new CalendarEvent(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.kind = source["kind"];
	        this.sourceId = source["sourceId"];
	        this.name = source["name"];
	        this.amount = source["amount"];
	    }
	}
	export class CashFlowSettings {
	    // Go type: time
	    nextPaycheckDate?: any;
	    desiredCashBuffer: number;

	    static createFrom(source: any = {}) {
	        return new CashFlowSettings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nextPaycheckDate = this.convertValues(source["nextPaycheckDate"], null);
	        this.desiredCashBuffer = source["desiredCashBuffer"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CashFlowSummary {
	    cashAvailable: number;
	    incomeBeforeNextPaycheck: number;
	    upcomingBills: number;
	    flexibleSpendingRemaining: number;
	    projectedBalance: number;
	    desiredCashBuffer: number;
	    safeToSpend: number;
	    // Go type: time
	    nextPaycheckDate?: any;
	    status: string;

	    static createFrom(source: any = {}) {
	        return new CashFlowSummary(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cashAvailable = source["cashAvailable"];
	        this.incomeBeforeNextPaycheck = source["incomeBeforeNextPaycheck"];
	        this.upcomingBills = source["upcomingBills"];
	        this.flexibleSpendingRemaining = source["flexibleSpendingRemaining"];
	        this.projectedBalance = source["projectedBalance"];
	        this.desiredCashBuffer = source["desiredCashBuffer"];
	        this.safeToSpend = source["safeToSpend"];
	        this.nextPaycheckDate = this.convertValues(source["nextPaycheckDate"], null);
	        this.status = source["status"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Category {
	    id: number;
	    name: string;
	    type: string;
	    parentCategoryId?: number;
	    defaultAmount: number;

	    static createFrom(source: any = {}) {
	        return new Category(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.parentCategoryId = source["parentCategoryId"];
	        this.defaultAmount = source["defaultAmount"];
	    }
	}
	export class IncomeSchedule {
	    id: number;
	    name: string;
	    amount: number;
	    active: boolean;
	    schedule: schedule.Rule;

	    static createFrom(source: any = {}) {
	        return new IncomeSchedule(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.amount = source["amount"];
	        this.active = source["active"];
	        this.schedule = this.convertValues(source["schedule"], schedule.Rule);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class Transaction {
	    id: number;
	    // Go type: time
	    date: any;
	    amount: number;
	    type: string;
	    description: string;
	    categoryId: number;
	    accountId: number;
	    notes: string;
	    status: string;

	    static createFrom(source: any = {}) {
	        return new Transaction(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.date = this.convertValues(source["date"], null);
	        this.amount = source["amount"];
	        this.type = source["type"];
	        this.description = source["description"];
	        this.categoryId = source["categoryId"];
	        this.accountId = source["accountId"];
	        this.notes = source["notes"];
	        this.status = source["status"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace schedule {

	export class Rule {
	    cadence: string;
	    anchorDate: string;
	    secondDay: number;
	    endDate: string;

	    static createFrom(source: any = {}) {
	        return new Rule(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cadence = source["cadence"];
	        this.anchorDate = source["anchorDate"];
	        this.secondDay = source["secondDay"];
	        this.endDate = source["endDate"];
	    }
	}

}

