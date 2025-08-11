import { WorkbookFormatting } from '../../Shared/WorkbookFormattingInterfaces';
import { ExtensionContext, ExtensionMode } from './Tableau';
/**
 * The environment namespace provides a way to programmatically gather
 * information about the environment in which the Extensions is running.
 */
export interface Environment {
    /**
     * @returns  The version of the API being used by the Extensions.
     */
    readonly apiVersion: string;
    /**
     * @returns  Current context in which the Extensions is running (i.e. Desktop or Server).
     */
    readonly context: ExtensionContext;
    /**
     * @returns  The language of the Tableau instance that is running the Extension.
     * The language is the ISO 639 language string of the user specified language.
     * If the user specified language is Français (Canada), language is fr.
     */
    readonly language: string;
    /**
     * @returns The country of the Tableau instance that is running the Extension.
     * The country is the ISO 3166 country string represented by the user specified language.
     * If the user specified lanugage is Français (Canada), country is CA.
     * @since 1.9.0 and Tableau 2022.2
     * If running against a Tableau version prior to 2022.2, country will be undefined.
     */
    readonly country?: string;
    /**
     * @returns  WorkbookFormatting contains an array of FormattingSheets that will get
     * your formatting information from the workbook.
     * The types of sheet formatting by Class Name Key: WorksheetTitle, Worksheet (body text),
     * Tooltip, StoryTitle, and DashboardTitle
     * These formatting sheets include the following CSS properties: fontName, fontSize,
     * isFontBold, isFontItalic, isFontUnderlined, and color.
     * @since 1.7.0 and Tableau 2021.4
     */
    readonly workbookFormatting?: WorkbookFormatting;
    /**
     * @returns  The OS locale of the environment in which the Extension is running.
     * Tableau Server supports both a language and a locale. This is the locale as
     * defined in RFC 5646 in lowercase.
     * If the user specified locale is English (United States), the locale is en-us.
     */
    readonly locale: string;
    /**
     * @returns  Current mode of the Extensions (i.e. authoring or viewing).
     */
    readonly mode: ExtensionMode;
    /**
     * @returns  The OS in which Tableau is running.
     */
    readonly operatingSystem: string;
    /**
     * @returns  The version of Tableau that is running the Extensions.
     */
    readonly tableauVersion: string;
    /**
     * @returns  A unique id representing the current user.
     * The id is unique across a Tableau deployment or across a Tableau Cloud Site.
     * When the extension is running in desktop, the uniqueUserId is derived from machine-name/user-name.
     * When the extension is running in server, the uniqueUserId is derived from the user's login name.
     * There is no mechanism to obtain the actual user name or any additional user information.
     * If running against a Tableau version prior to 2023.2, uniqueUserId will be undefined.
     */
    readonly uniqueUserId?: string;
}
//# sourceMappingURL=Environment.d.ts.map