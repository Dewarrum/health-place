/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as lib_authz from "../lib/authz.js";
import type * as lib_recurrence from "../lib/recurrence.js";
import type * as sessionParticipants from "../sessionParticipants.js";
import type * as sessions from "../sessions.js";
import type * as sessionsInternal from "../sessionsInternal.js";
import type * as sessionsTypes from "../sessionsTypes.js";
import type * as studios from "../studios.js";
import type * as user from "../user.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "lib/authz": typeof lib_authz;
  "lib/recurrence": typeof lib_recurrence;
  sessionParticipants: typeof sessionParticipants;
  sessions: typeof sessions;
  sessionsInternal: typeof sessionsInternal;
  sessionsTypes: typeof sessionsTypes;
  studios: typeof studios;
  user: typeof user;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
