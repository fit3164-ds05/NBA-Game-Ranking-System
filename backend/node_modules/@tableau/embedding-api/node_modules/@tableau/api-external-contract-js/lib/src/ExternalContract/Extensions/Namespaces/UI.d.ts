import { DialogStyle } from '../../Shared/Namespaces/Tableau';
/**
 * The UI namespace contains methods that allow an extension to display a popup
 * dialog window. A modal dialog can be useful in authentication or configuration scenarios,
 * or when extra situational UI space is needed. Only one dialog can be displayed at a time per extension.
 * Inside the popup dialog window, another extension can be loaded and run. This *dialog extension* will have full access
 * to the functions provided by the Extensions API. One difference between the extension running in the popup dialog window
 * and an extension running in the dashboard is that the popup dialog window must call
 * the `initializeDialogAsync()` method instead of `initializeAsync()` to initialize the extension.
 *
 * **Note** If you want to use a popup dialog window on Tableau Server, you need to let users know that their browser must be
 *  configured to allow popups.
 */
export interface UI {
    /**
     * @param url           The url of the 'dialog extension' to navigate to in the dialog. The url must
     *                      belong to the same domain as the parent extension.
     * @since 1.3.0         A relative path may be used beginning with Tableau 2019.3 and version 1.3.0 of the Extensions API library.
     *                      The relative path must resolve to the directory, or a child directory, of the extension.
     *                      Root-relative paths are not allowed. For example, `./config.html` or `config.html` are allowed,
     *                      but not the root-relative path `/config.html`.
     *                      **Note** If your extension is meant for use in versions of Tableau prior to 2019.3,
     *                      you should use an absolute url.
     * @param payload       The `payload` is optional, and is used to provide data to the popup dialog window
     *                      at startup. The `payload` will be returned to the dialog extension as the return
     *                      value of the call to the `tableau.extensions.ui.initializeDialogAsync` function.
     *                      If no `payload` is provided, you must indicate this with an empty string `" "`.
     * @param dialogOptions Specifies the options for the popup dialog window.
     *                      The `dialogOptions` has properties for width and height (in pixels) and a property for the dialog's style.
     *                      The dialog style can be a window, a modal dialog, or a modeless dialog. If style is not specified, window will be used.
     *                      You pass these properties to the `displayDialogAsync` function, as follows:
     *                      `{width:` *number*`, height:` *number*`, dialogStyle:` *DialogStyle*`}`
     *
     *
     * @returns A promise that resolves when the dialog has been closed. It will contain a
     *          payload as a string provided by the dialog extension. The promise is rejected if
     *          the user manually closes the dialog window (for example, by clicking the 'X' in window).
     *          It is good practice to handle this error condition with a catch block, as in the following example.
     *
     *  ```
     *   tableau.extensions.ui.displayDialogAsync(popupUrl, defaultPayload, { width: 500, height: 500 }).then((closePayload) => {
     *     //
     *     // The promise is resolved when the dialog has been closed as expected, meaning that
     *     // the popup extension has called tableau.extensions.ui.closeDialog() method.
     *     // The close payload (closePayload) is returned from the popup extension
     *     // via the closeDialog() method.
     *     //
     *    }).catch((error) => {
     *     // One expected error condition is when the popup is closed by the user (meaning the user
     *     // clicks the 'X' in the top right of the dialog). This can be checked for like so:
     *       switch(error.errorCode) {
     *         case tableau.ErrorCodes.DialogClosedByUser:
     *           console.log("Dialog was closed by user");
     *           break;
     *         default:
     *       console.error(error.message);
     *       }
     *     });
     *  ```
     *
     */
    displayDialogAsync(url: string, payload?: string, dialogOptions?: DialogOptions): Promise<string>;
    /**
     * The `closeDialog` method must be called from extension running in the popup dialog window.
     *
     * @param payload The `payload` is optional, and if specified, it is made available to parent extension when
     *                this popup dialog closes. If the extension running in the popup dialog window does not return
     *                a payload, you must still provide an empty string `" "` as a return value.
     *
     * ```
     *    tableau.extensions.ui.closeDialog('myPayload string');
     *
     * ```
     * The following example shows a call to the closeDialog method when the dialog extension does not return a payload.
     *
     * ```
     *    // specify an empty string if no payload is returned
     *    tableau.extensions.ui.closeDialog('');
     * ```
     *
     */
    closeDialog(payload?: string): void;
}
export interface DialogOptions {
    /** Specifies the suggested width (in pixels) of dialog to display.  Not guaranteed to be exactly that width. */
    readonly width?: number;
    /** Specifies the suggested height (in pixels) of the popup dialog.  Not guaranteed to be exactly that height. */
    readonly height?: number;
    /**
     * Specifies the style for the popup dialog.
     * @since 1.10.0 and Tableau 2022.4
     */
    readonly dialogStyle?: DialogStyle;
}
//# sourceMappingURL=UI.d.ts.map