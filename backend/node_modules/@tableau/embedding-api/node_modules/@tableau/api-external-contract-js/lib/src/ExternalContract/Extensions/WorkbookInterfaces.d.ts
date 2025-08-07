import { DataSource } from '../Shared/DataSourceInterfaces';
/**
 * The `Workbook` represents the currently open workbook.
 * @since 1.6.0 and Tableau 2021.3
 */
export interface Workbook {
    /**
     *  Gets the data sources for this workbook. Note that calling this method might negatively impact performance
     *  and responsiveness of the viz that your extension is added to. The method is not entirely
     *  asynchronous and includes some serial operations.
     *
     * @returns All data sources used in this workbook.
     *
     * @since 1.6.0 and Tableau 2021.3
     */
    getAllDataSourcesAsync(): Promise<Array<DataSource>>;
}
//# sourceMappingURL=WorkbookInterfaces.d.ts.map