export interface ApiSuccess<T> {
  readonly data: T;
}

export interface ApiErrorPayload {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly fields?: Readonly<Record<string, string>>;
  };
}

export interface Pagination {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export interface PageData<T> {
  readonly items: readonly T[];
  readonly pagination: Pagination;
}

export type RequestScope = Readonly<{
  environmentId: string;
  userId: string | null;
  generation: number;
}>;
