export declare enum SharedErrorCodes {
    /**
     * A CSV or Excel file failed to be created in Viz.exportCrosstabAsync().
     */
    CrosstabCreationError = "crosstab-creation-error",
    /**
     * A CSV file failed to be created in Viz.exportDataAsync().
     */
    DataCreationError = "data-creation-error",
    /**
     * An invalid aggregation was specified for the filter, such as setting a range filter to "SUM(Sales)" instead of
     * "Sales".
     */
    InvalidAggregationFieldName = "invalid-aggregation-field-name",
    /**
     * A filter operation was attempted on a field that does not exist in the data source.
     */
    InvalidFilterFieldName = "invalid-filter-name",
    /**
     * A filter operation was attempted using a value that is the wrong data type or format.
     */
    InvalidFilterFieldValue = "invalid-filter-fieldValue",
    /**
     * An invalid date value was specified in a Sheet.selectMarksAsync() call for a date field.
     */
    InvalidSelectionDate = "invalid-selection-date",
    /**
     * A field was specified in a Sheet.selectMarksAsync() call that does not exist in the data source.
     */
    InvalidSelectionFieldName = "invalid-selection-fieldName",
    /**
     * An invalid value was specified in a Sheet.selectMarksAsync() call.
     */
    InvalidSelectionValue = "invalid-selection-value",
    /**
     * A parameter did not include a valid sheet selection for exporting.
     */
    InvalidSelectionSheet = "invalid-selection-sheet",
    /**
     * An error occurred within the Tableau API. Contact Tableau Support.
     */
    InternalError = "internal-error",
    /**
     * A parameter is not the correct data type or format. The name of the parameter is specified in the Error.message field.
     */
    InvalidParameter = "invalid-parameter",
    /**
     * A PDF file failed to be created in Viz.exportPDFAsync().
     */
    PDFCreationError = "pdf-creation-error",
    /**
     * A PowerPoint file failed to be created in Viz.exportPowerPointAsync().
     */
    PowerPointCreationError = "powerpoint-creation-error",
    /**
     * An operation was attempted on a sheet that is not active or embedded within the active dashboard.
     */
    NotActiveSheet = "not-active-sheet",
    /**
     * Property or Function is not supported within the Tableau API.
     */
    ImplementationError = "wrong-implementation",
    /**
     * Can occur when two incompatible calls are triggered together.
     */
    ApiExecutionError = "api-execution-error",
    /**
     * A general-purpose server error occurred. Details are contained in the Error object.
     */
    ServerError = "server-error",
    /**
     * Can occur when an api call times out.
     */
    Timeout = "timeout"
}
//# sourceMappingURL=Enums.d.ts.map