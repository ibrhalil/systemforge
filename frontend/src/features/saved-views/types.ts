/** Backend `SavedViewResponse` (K-56 F3). `state` is the ListQuerySnapshot JSON — opaque to the wire layer. */
export interface SavedViewDto {
  id: string;
  storageKey: string;
  name: string;
  state: string;
  createdDate: string | null;
  updatedAt: string | null;
}

/** `POST /api/v1/saved-views` body — create-or-replace by case-insensitive name per user+table. */
export interface SaveSavedViewRequest {
  storageKey: string;
  name: string;
  state: string;
}
