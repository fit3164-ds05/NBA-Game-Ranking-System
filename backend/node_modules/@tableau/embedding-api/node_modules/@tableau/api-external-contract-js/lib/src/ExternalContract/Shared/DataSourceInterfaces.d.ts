import { DataTable, DataTableReader } from './DataTableInterfaces';
import { ColumnType, DataType, FieldAggregationType, FieldRoleType, IncludeDataValuesOption } from './Namespaces/Tableau';
/**
 * Represents the data source used by a Worksheet.
 */
export interface DataSource {
    /**
     * @returns The user friendly name of the data source as seen in the UI.
     */
    readonly name: string;
    /**
     * @returns Unique string representing this data source.
     */
    readonly id: string;
    /**
     * @returns An array of fields associated with this data source.
     */
    readonly fields: Array<Field>;
    /**
     * @returns Last update time of the data source's extract, or undefined if this data source is live.
     */
    readonly extractUpdateTime: string | undefined;
    /**
     * @returns True if this data source is an extract, false otherwise.
     */
    readonly isExtract: boolean;
    /**
     * @returns True if this data source is published to server, false otherwise. Always undefined prior to Tableau 2021.4.
     * @since 1.7.0 and Tableau 2021.4
     */
    readonly isPublished: boolean | undefined;
    /**
     * @returns URL of data source if published to server, undefined otherwise. Always undefined prior to Tableau 2021.4.
     * @since 1.7.0 and Tableau 2021.4
     * @hidden For first class extensions only
     */
    publishedUrl(): string | undefined;
    /**
     * This call has the same functionality as clicking the Refresh option on a data source in
     * Tableau.  This does not refresh an extract.
     *
     * **Note:** The `refreshAsync()` method is intended to be used in scenarios where manual
     * interaction causes a need to refresh the data in the Tableau visualization. The method is not,
     * as currently designed, meant to support or emulate streaming or *live* visualizations.
     * Extensions that use the method to refresh aggressively or automatically
     * can cause issues on Tableau Server and Tableau Online and are subject to being blocked
     * by the Tableau Online administrator.
     *
     * This call does not currently support refreshing live Google Sheet data sources.
     *
     * @returns Promise that resolves when the data source has finished refreshing.
     */
    refreshAsync(): Promise<void>;
    /**
     * @returns An array of table summary objects that are currently used in the data source.
     *
     * @throws  UnsupportedMethodForDataSourceType error if this method is called on a Cube DataSource or GA.
     *
     * @deprecated since version 1.4.0.  Use DataSource.getLogicalTablesAsync.
     */
    getActiveTablesAsync(): Promise<Array<TableSummary>>;
    /**
     * @returns An array of descriptions of the connections within this data source.
     */
    getConnectionSummariesAsync(): Promise<Array<ConnectionSummary>>;
    /**
     * @param options  Collection of options to change the behavior of the call.
     * @returns        Returns a promise containing a page of data from the underlying data of the data source.
     *
     * The following example shows use of the `getUnderlyingDataAsync()` method to get the underlying data from a specific data source.
     * The example uses the JavaScript `find()` method to select the workbook and data source.
     *
     * ```
     * const dataSources = await worksheet.getDataSourcesAsync();
     * const dataSource = dataSources.find(datasource => datasource.name === "Sample - Superstore");
     * const dataTable = await dataSource.getUnderlyingDataAsync();
     * let field = dataTable.columns.find(column => column.fieldName === "Sub-Category");
     * let list = [];
     * for (let row of dataTable.data) {
     *     list.push(row[field.index].value);
     * }
     * let values = list.filter((el, i, arr) => arr.indexOf(el) === i);
     * console.log(values);
     *
     * ```
     * @deprecated Use DataSource.getLogicalTableDataReaderAsync or DataSource.getLogicalTableDataAsync.
     */
    getUnderlyingDataAsync(options?: DataSourceUnderlyingDataOptions): Promise<DataTable>;
    /**
     *
     * Gets the underlying logical tables used in the data source.
     *
     * @since 1.4.0
     * @returns An array of logical tables that are currently used in the data source.
     *
     * The following example uses the `getLogicalTablesAsync` method to print the names of the
     * the logical tables to the console.
     *
     * ```
     * dataSource.getLogicalTablesAsync().then(function (logicalTables) {
     *   // Loop through each table that was used in creating this data source
     *   logicalTables.forEach(function (table) {
     *      console.log(table.caption);
     *   });
     * });
     * ```
     */
    getLogicalTablesAsync(): Promise<Array<LogicalTable>>;
    /**
     * Gets the underlying data table for the given logical table id.
     *
     * @param options  Collection of options to change the behavior of the call.
     * @returns A data table containing the underlying data of the data source.
     * @see getLogicalTableDataReaderAsync to read more than 10,000 rows.
     *
     * You can use the `getUnderlyingDataOptions.maxRows` property to request the number of rows of data to return.
     * If unspecified (maxRows == '0'), the call to `getLogicalTableDataAsync` requests all rows in the logical table.
     * Note that the maximum number of rows returned from the `getLogicalTableDataAsync()` method is limited
     * to 10,000 rows. You can use the `DataTable` property, `isTotalRowCountLimited`, to test whether there is
     * more data. A value of true indicates that the calling function requested more rows than the limit (10,000) and the
     * underlying data source contains more rows than can be returned.
     *
     * The following example shows use of the getLogicalTableDataAsync() method to get the data from a specific logical table in a data source.
     * The example uses the JavaScript find() method to select the workbook, and uses the getLogicalTablesAsync method to identify the logical table id.
     * ```
     * const dataSources = await worksheet.getDataSourcesAsync();
     * const dataSource = dataSources.find(datasource => datasource.name === "Sample - Superstore");
     * const logicalTables = await dataSource.getLogicalTablesAsync()
     * const dataTable = await dataSource.getLogicalTableDataAsync(logicalTables[0].id);
     * console.log(dataTable);
     * ```
     */
    getLogicalTableDataAsync(logicalTableId: string, options?: DataSourceUnderlyingDataOptions): Promise<DataTable>;
    /**
     * Gets the underlying data table reader for the given logical table id.
     * Only one active DataTableReader per logical table id is supported.
     *
     * @param logicalTableId logical table id.
     * @param pageRowCount The number of rows per page. The default and maximum is 10,000 rows.
     * @param options  Collection of options to change the behavior of the reader.
     * @returns        A data table reader to access the logical table data in the data source.
     * @hidden
     * `getLogicalTableDataReaderAsync` attempts to prepare all the rows of the table to be read as pages.
     * There is a limit to the number of rows that can be prepared. The default limit is about 1 million
     * rows of data. However, if the data source has many columns, this number will be adjusted downward.
     * You can change the default limit with the Tableau Server (Cloud) or Tableau Desktop option: ExtensionsAndEmbeddingReaderCellLimit.
     * If the data source has many columns, `getLogicalTableDataReaderAsync` can be sped up by only requesting
     * native data values in the `DataSourceUnderlyingDataOptions`.
     *
     * The following example shows use of the `getLogicalTableDataReaderAsync` and `getAllPagesAsync` to
     * prepare pages of 10,000 rows each, and then to get a maximum of 150,000 rows of native data from
     * a specific logical table in a data source.
     *
     * ```
     * const dataSources = await worksheet.getDataSourcesAsync();
     * const dataSource = dataSources.find(datasource => datasource.name === "Sample - Superstore");
     * const logicalTables = await dataSource.getLogicalTablesAsync()
     * const dataTableReader = await dataSource.getLogicalTableDataReaderAsync(logicalTables[0].id, 10000,
     *     { includeDataValuesOption: tableau.IncludeDataValuesOption.OnlyNativeValues });
     * const dataTable = await dataTableReader.getAllPagesAsync(150000);
     * console.log(dataTable);
     * await dataTableReader.releaseAsync();
     * ```
     */
    getLogicalTableDataReaderAsync(logicalTableId: string, pageRowCount?: number, options?: DataSourceUnderlyingDataOptions): Promise<DataTableReader>;
}
/**
 * Basic properties of a field
 * @hidden
 */
export interface FieldBase {
    /**
     * @returns  The name of the field (i.e. the caption).
     */
    readonly name: string;
    /**
     * @returns  User description of field, undefined if there is none.
     */
    readonly description: string | undefined;
    /**
     * @returns The data type of the field
     */
    readonly dataType: DataType | undefined;
    /**
     * @returns  The role of this field.
     */
    readonly role: FieldRoleType;
    /**
     * @returns  The type of aggregation for this field.
     */
    readonly aggregation: FieldAggregationType;
    /**
     * @returns  The type of the column, either discrete or continuous. Could hold value 'Unknown'.
     */
    readonly columnType: ColumnType;
    /**
     * @returns  True if this field is a table calculation.
     */
    readonly isCalculatedField: boolean;
    /**
     * @returns  True if this field is a combination of multiple fields, false otherwise.
     */
    readonly isCombinedField: boolean;
    /**
     * @returns  True if this field is generated by Tableau, false otherwise.
     *           Tableau generates a number of fields for a data source, such as Number
     *           of Records, or Measure Values.  This property can be used to
     *           distinguish between those fields and fields that come from the underlying
     *           data connection, or were created by a user.
     */
    readonly isGenerated: boolean;
    /**
     * @returns True if this role has a semantic type of geospatial: e.g latitude, longitude, zipcode, City name...
     */
    readonly isGeospatial: boolean;
    /**
     * @returns  True if this field is hidden, false otherwise.
     */
    readonly isHidden: boolean;
    /**
     * @returns  True if this field comes from the published datasource. False if it was created in Tableau (as a calculated field, for example).
     */
    readonly isPresentOnPublishedDatasource: boolean;
}
/**
 * A field contains information about what data source it belongs to,
 * its role, and the ability to fetch the domain values.
 */
export interface Field extends FieldBase {
    /**
     * @returns  Unique string representing this field in this datasource.
     */
    readonly id: string;
    /**
     * @returns  The data source to which this field belongs.
     */
    readonly dataSource: DataSource;
}
/**
 * Represents a connection within a datasource (ex: A SQL Server connection).
 * A data source can be composed of one or more connections.
 */
export interface ConnectionSummary {
    /**
     * @returns The name of the connection (i.e. the caption).
     */
    readonly name: string;
    /**
     * @returns Unique string representing this connection.
     */
    readonly id: string;
    /**
     * @returns The type of the connection (i.e. SQL Server, web data connector).
     */
    readonly type: string;
    /**
     * @returns The URI to which the connection is pointing, if applicable.
     *          If a data source is a published data source, the URI is returned
     *          as `localhost`.
     */
    readonly serverURI: string | undefined;
}
/**
 * Represents a table of data in a data source.
 */
export interface TableSummary {
    /**
     * @returns The name of the table (i.e. the caption).
     */
    readonly name: string;
    /**
     * @returns Unique string representing this table.
     */
    readonly id: string;
    /**
     * @returns the ID of the connection that this table belongs to.
     */
    readonly connectionId: string;
    /**
     * @returns the custom SQL used to create this table if it was created with Custom SQL, undefined otherwise.
     */
    readonly customSQL: string | undefined;
}
/**
 *
 * Configuration object for fetching data from an data source object.
 */
export interface DataSourceUnderlyingDataOptions {
    /**
     * Do not use aliases specified in the data source in Tableau. Default is false.
     */
    ignoreAliases?: boolean;
    /**
     * The columns to return specified by field name, returns all by default.
     */
    columnsToInclude?: Array<string>;
    /**
     * The columns to return specified by field id, returns all by default.
     * Since 1.5.0, fieldId is a property of the Column object.
     *
     * @since 1.5.0
     */
    columnsToIncludeById?: Array<string>;
    /**
     * The maximum number of rows to return. 10,000 by default
     * @since 1.10.0 and Tableau 2022.4 Consider using a DataTableReader returned by one of the get...DataReaderAsync methods
     * to avoid the 10,000 row limit.
     */
    maxRows?: number;
    /**
     * Specify which properties to return in DataValues. The default is `IncludeDataValuesOption.AllValues`.
     * All properties not requested will be `undefined` in the DataValue results.
     * This is a performance optimization only, and will be ignored in Tableau versions prior to 2021.2.
     *
     * @since 1.5.0
     */
    includeDataValuesOption?: IncludeDataValuesOption;
}
/**
 * @since 1.4.0
 * Represents a logical table in a data source or a logical table used in a worksheet
 */
export interface LogicalTable {
    readonly id: string;
    readonly caption: string;
}
//# sourceMappingURL=DataSourceInterfaces.d.ts.map