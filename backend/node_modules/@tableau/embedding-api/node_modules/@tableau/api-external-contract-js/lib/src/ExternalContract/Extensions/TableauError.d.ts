import { ErrorCodes } from './Namespaces/Tableau';
/**
 * Custom error class that extends the default JavaScript Error object.
 */
export interface TableauError extends Error {
    /**
     * @returns Tableau specific ErrorCode
     */
    readonly errorCode: ErrorCodes;
}
//# sourceMappingURL=TableauError.d.ts.map