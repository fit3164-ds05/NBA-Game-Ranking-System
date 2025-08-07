/**
 * @hidden
 * Represents the currently connected server.
 * Reserved for first class extensions only.
 */
export interface ConnectedServer {
    /**
     * @returns  Returns an id representing the current user signed into server.
     *           Returns undefined if on desktop and not connected to server.
     */
    readonly userId?: string;
    /**
     * @returns  Returns an id representing the current site when signed into server.
     *           Returns undefined if on desktop and not connected to server.
     */
    readonly siteId?: string;
    /**
     * @returns  Returns an string representing the current siteNamespace when signed into server.
     *           Returns undefined if on desktop and not connected to server.
     */
    readonly siteNamespace?: string;
    /**
     * @returns  Returns an id representing the current workbook when loaded from server.
     *           Returns undefined if on desktop with a local workbook.
     */
    readonly workbookId?: string;
    /**
     * @returns Returns a list of enabled feature flags meant for extensions,
     *          or undefined if no flags have been passed.
     */
    readonly featureFlags?: string[];
}
//# sourceMappingURL=EnvironmentInterfaces.d.ts.map