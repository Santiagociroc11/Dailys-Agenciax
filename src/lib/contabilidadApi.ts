const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

function url(path: string, params?: Record<string, string>) {
  const base = `${API_BASE}/api/contabilidad`;
  const full = `${base}${path}`;
  if (!params) return full;
  const search = new URLSearchParams(params).toString();
  return search ? `${full}?${search}` : full;
}

async function fetchJson<T>(urlStr: string, options?: RequestInit): Promise<T> {
  const res = await fetch(urlStr, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? 'Error de red');
  }
  return json as T;
}

export interface AcctEntity {
  id: string;
  name: string;
  type: 'project' | 'agency' | 'internal';
  sort_order?: number;
}

export interface AcctCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  parent_id?: string | null;
  transaction_count?: number;
}

export interface AcctPaymentAccount {
  id: string;
  name: string;
  currency?: string;
}

export interface AcctTransaction {
  id: string;
  date: string;
  amount: number;
  currency?: string;
  type: 'income' | 'expense' | 'transfer';
  entity_id?: string | null;
  category_id?: string | null;
  payment_account_id: string;
  description?: string;
  created_by?: string | null;
  entity_name?: string | null;
  category_name?: string | null;
  payment_account_name?: string | null;
}

export interface BalanceRow {
  entity_id: string | null;
  entity_name: string;
  entity_type: string | null;
  usd: number;
  cop: number;
}

export interface BalanceResponse {
  rows: BalanceRow[];
  total_usd: number;
  total_cop: number;
}

export interface PygRow {
  entity_id: string | null;
  entity_name: string;
  entity_type: string | null;
  usd: { ingresos: number; gastos: number; resultado: number };
  cop: { ingresos: number; gastos: number; resultado: number };
}

export interface PygResponse {
  rows: PygRow[];
  total_usd: { ingresos: number; gastos: number; resultado: number };
  total_cop: { ingresos: number; gastos: number; resultado: number };
}

export interface AccountBalanceRow {
  payment_account_id: string;
  account_name: string;
  usd: number;
  cop: number;
}

export interface AccountBalancesResponse {
  rows: AccountBalanceRow[];
  total_usd: number;
  total_cop: number;
}

export const contabilidadApi = {
  async getEntities(): Promise<AcctEntity[]> {
    return fetchJson<AcctEntity[]>(url('/entities'));
  },
  async createEntity(data: { name: string; type: string; sort_order?: number }, createdBy?: string): Promise<AcctEntity> {
    return fetchJson<AcctEntity>(url('/entities'), {
      method: 'POST',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async updateEntity(id: string, data: { name?: string; type?: string; sort_order?: number }, createdBy?: string): Promise<AcctEntity> {
    return fetchJson<AcctEntity>(url(`/entities/${id}`), {
      method: 'PUT',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async deleteEntity(id: string, createdBy?: string): Promise<{ id: string }> {
    return fetchJson<{ id: string }>(url(`/entities/${id}`, createdBy ? { created_by: createdBy } : undefined), {
      method: 'DELETE',
    });
  },
  async mergeEntity(id: string, targetEntityId: string, createdBy?: string): Promise<{ merged: number; deleted_entity_id: string }> {
    return fetchJson<{ merged: number; deleted_entity_id: string }>(url(`/entities/${id}/merge`), {
      method: 'POST',
      body: JSON.stringify({ target_entity_id: targetEntityId, created_by: createdBy }),
    });
  },

  async getCategories(): Promise<AcctCategory[]> {
    return fetchJson<AcctCategory[]>(url('/categories'));
  },
  async createCategory(data: { name: string; type: string; parent_id?: string | null }, createdBy?: string): Promise<AcctCategory> {
    return fetchJson<AcctCategory>(url('/categories'), {
      method: 'POST',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async updateCategory(id: string, data: { name?: string; type?: string; parent_id?: string | null }, createdBy?: string): Promise<AcctCategory> {
    return fetchJson<AcctCategory>(url(`/categories/${id}`), {
      method: 'PUT',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async deleteCategory(id: string, createdBy?: string): Promise<{ id: string }> {
    return fetchJson<{ id: string }>(url(`/categories/${id}`, createdBy ? { created_by: createdBy } : undefined), {
      method: 'DELETE',
    });
  },
  async mergeCategory(id: string, targetCategoryId: string, createdBy?: string): Promise<{ merged: number; deleted_category_id: string }> {
    return fetchJson<{ merged: number; deleted_category_id: string }>(url(`/categories/${id}/merge`), {
      method: 'POST',
      body: JSON.stringify({ target_category_id: targetCategoryId, created_by: createdBy }),
    });
  },

  async getPaymentAccounts(): Promise<AcctPaymentAccount[]> {
    return fetchJson<AcctPaymentAccount[]>(url('/payment-accounts'));
  },
  async createPaymentAccount(data: { name: string; currency?: string }, createdBy?: string): Promise<AcctPaymentAccount> {
    return fetchJson<AcctPaymentAccount>(url('/payment-accounts'), {
      method: 'POST',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async updatePaymentAccount(id: string, data: { name?: string; currency?: string }, createdBy?: string): Promise<AcctPaymentAccount> {
    return fetchJson<AcctPaymentAccount>(url(`/payment-accounts/${id}`), {
      method: 'PUT',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async deletePaymentAccount(id: string, createdBy?: string): Promise<{ id: string }> {
    return fetchJson<{ id: string }>(url(`/payment-accounts/${id}`, createdBy ? { created_by: createdBy } : undefined), {
      method: 'DELETE',
    });
  },

  async getTransactions(params?: { start?: string; end?: string; entity_id?: string | null; category_id?: string; payment_account_id?: string }): Promise<AcctTransaction[]> {
    const search: Record<string, string> = {};
    if (params?.start) search.start = params.start;
    if (params?.end) search.end = params.end;
    if (params?.entity_id !== undefined) {
      search.entity_id = params.entity_id == null || params.entity_id === '' ? '__null__' : params.entity_id;
    }
    if (params?.category_id) search.category_id = params.category_id;
    if (params?.payment_account_id) search.payment_account_id = params.payment_account_id;
    return fetchJson<AcctTransaction[]>(url('/transactions', Object.keys(search).length > 0 ? search : undefined));
  },
  async createTransaction(data: {
    date: string;
    amount: number;
    currency?: string;
    type: string;
    entity_id?: string | null;
    category_id?: string | null;
    payment_account_id: string;
    description?: string;
  }, createdBy?: string): Promise<AcctTransaction> {
    return fetchJson<AcctTransaction>(url('/transactions'), {
      method: 'POST',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async updateTransaction(id: string, data: Partial<{
    date: string;
    amount: number;
    currency: string;
    type: string;
    entity_id: string | null;
    category_id: string | null;
    payment_account_id: string;
    description: string;
  }>, createdBy?: string): Promise<AcctTransaction> {
    return fetchJson<AcctTransaction>(url(`/transactions/${id}`), {
      method: 'PUT',
      body: JSON.stringify({ ...data, created_by: createdBy }),
    });
  },
  async deleteTransaction(id: string, createdBy?: string): Promise<{ id: string }> {
    return fetchJson<{ id: string }>(url(`/transactions/${id}`, createdBy ? { created_by: createdBy } : undefined), {
      method: 'DELETE',
    });
  },

  async getBalance(params?: { start?: string; end?: string }): Promise<BalanceResponse> {
    const search: Record<string, string> = {};
    if (params?.start) search.start = params.start;
    if (params?.end) search.end = params.end;
    return fetchJson<BalanceResponse>(url('/balance', Object.keys(search).length > 0 ? search : undefined));
  },

  async getPyg(params?: { start?: string; end?: string }): Promise<PygResponse> {
    const search: Record<string, string> = {};
    if (params?.start) search.start = params.start;
    if (params?.end) search.end = params.end;
    return fetchJson<PygResponse>(url('/pyg', Object.keys(search).length > 0 ? search : undefined));
  },

  async getAccountBalances(params?: { start?: string; end?: string }): Promise<AccountBalancesResponse> {
    const search: Record<string, string> = {};
    if (params?.start) search.start = params.start;
    if (params?.end) search.end = params.end;
    return fetchJson<AccountBalancesResponse>(url('/account-balances', Object.keys(search).length > 0 ? search : undefined));
  },

  async importCsv(csvText: string, options?: { default_currency?: string }, createdBy?: string): Promise<ImportResult> {
    return fetchJson<ImportResult>(url('/import'), {
      method: 'POST',
      body: JSON.stringify({
        csv_text: csvText,
        default_currency: options?.default_currency ?? 'USD',
        created_by: createdBy,
      }),
    });
  },
};

export interface ImportResult {
  created: number;
  skipped: number;
  entities: number;
  categories: number;
  accounts: number;
}
