import { Field } from './DataSourceInterfaces';
import { DataValue } from './DataTableInterfaces';
import { DateRangeType, FilterDomainType, FilterNullOption, FilterType, HierarchicalLevelSelectionState, PeriodType } from './Namespaces/Tableau';
/**
 *
 * An abstract base class for all of the filter types.
 */
export interface Filter {
    /**
     * @returns  The parent worksheet.
     */
    readonly worksheetName: string;
    /**
     * @returns  The type of the filter.
     */
    readonly filterType: FilterType;
    /**
     * @returns  The name of the field being filtered.  Note that this is the caption
     *           as shown in the UI, and not the actual database field name.
     */
    readonly fieldName: string;
    /**
     * @returns  The id of the field being filtered.
     */
    readonly fieldId: string;
    /**
     * @returns a promise containing the field for the filter.
     * @since 1.5.0 Fixed to properly return the field. Also requires Tableau 2019.2+.
     */
    getFieldAsync(): Promise<Field>;
    /**
     * @returns the list of worksheet names that have the filter applied.
     * @since 1.9.0 and Tableau 2022.2
     */
    getAppliedWorksheetsAsync(): Promise<Array<string>>;
    /**
     * Applies the filter to the specified list of worksheets.
     * If the worksheet(s) do not exist or do not contain the field in their data sources, an exception is thrown.
     *
     * @param applyToWorksheets list of worksheets to apply the filter on
     * @returns the list of worksheet names that have the filter applied
     * @since 1.9.0 and Tableau 2022.2
     */
    setAppliedWorksheetsAsync(applyToWorksheets: Array<string>): Promise<Array<string>>;
}
/**
 * A Categorical Filter
 */
export interface CategoricalFilter extends Filter {
    /**
     * @returns True if all the values are selected for this filter. When 'All' is selected,
     * appliedValues returns an empty list.
     *
     * This field is available in Tableau 2019.2 or later
     */
    readonly isAllSelected?: boolean;
    /**
     * @returns  A list of values applied to this categorical filter. Notice that if this is a
     * dependent filter, the current relavent values can be fetched by calling
     * `getDomainAsync(tableau.FilterDomainType.Relevant)`.
     */
    readonly appliedValues: Array<DataValue>;
    /**
     * @returns  True if this filter is an exclude filter, false if an include filter.
     */
    readonly isExcludeMode: boolean;
    /**
     * @returns a promise containing the categorical domain for the filter. Note if a filter contains
     * multiple fields (such as a filter action with multiple fields), the values array in the returned
     * CategoricalDomain ({@link CategoricalDomain.values}) will be empty. If there are multiple fields
     * in the filter, the results need to be represented by a table, which is not currently supported.
     */
    getDomainAsync(domainType?: FilterDomainType): Promise<CategoricalDomain>;
}
/**
 * A Hierarchical Filter
 * Hierarchical Filters are used when a hierarchical field is used as a filter on a cube database.
 * As an example, assume a hierarchical field in Product, named ByCategory.
 * ByCategory has the following five levels: Family, Category, Subcategory, Brand, Sku.
 * @since Extensions 1.10.0 and Tableau version 2022.3
 */
export interface HierarchicalFilter extends Filter {
    /**
     * @returns The dimension name associated with the filter. In the ByCategory filter example, this would be 'Product'
     */
    readonly dimensionName: string;
    /**
     * @returns The hierarchy caption associated with the filter. In the ByCategory filter example, this would be '[Product].[ByCategory]'
     */
    readonly hierarchyCaption: string;
    /**
     * @returns The number of levels in the hierarchical filter. In the ByCategory filter example, this would be 5
     */
    readonly numberOfLevels: number;
    /**
     * @returns Details about each level in the hierarchical filter.
     */
    readonly levelDetails: Array<HierarchicalLevelDetail>;
    /**
     * @returns True if all the values are selected for this filter. When 'All' is selected,
     * appliedValues returns an empty list.
     */
    readonly isAllSelected: boolean;
    /**
     * @returns  A list of values applied to this hierarchical filter.
     */
    readonly appliedValues: Array<HierarchicalFilterDataValue>;
}
/**
 * A Range Filter
 */
export interface RangeFilter extends Filter {
    /**
     * @returns  Minimum value, inclusive, applied to the filter.
     */
    readonly minValue: DataValue;
    /**
     * @returns  Maximum value, inclusive, applied to the filter.
     */
    readonly maxValue: DataValue;
    /**
     * @returns  True if null values are included in the filter, false otherwise.
     */
    readonly includeNullValues: boolean;
    /**
     * @param domainType the domain type, defaults to relevant
     * @returns a promise containing the domain for the range filter
     */
    getDomainAsync(domainType?: FilterDomainType): Promise<RangeDomain>;
}
export interface RelativeDateFilter extends Filter {
    /**
     * @returns the anchor date of the filter
     */
    readonly anchorDate: DataValue;
    /**
     * @returns The date period of the filter.
     */
    readonly periodType: PeriodType;
    /**
     * @returns The range of the date filter (years, months, etc.).
     */
    readonly rangeType: DateRangeType;
    /**
     * @returns When getRange returns LASTN or NEXTN, this is the N value (how many years, months, etc.).
     */
    readonly rangeN: number;
}
/** *
 * Passed into the applyFilter methods to control advanced filtering options.
 */
export interface FilterOptions {
    /**
     * Determines whether the filter will apply in exclude mode or include mode.
     * The default is include, which means that you use the fields as part of a filter.
     * Exclude mode means that you include everything else except the specified fields.
     */
    readonly isExcludeMode: boolean;
}
/**
 * Options for Range Filter
 */
export interface RangeFilterOptions {
    readonly min?: number | Date;
    readonly max?: number | Date;
    readonly nullOption?: FilterNullOption;
}
/**
 * Options for Relative Date Filter
 * @since version 1.9.0 and Tableau 2022.2
 */
export interface RelativeDateFilterOptions {
    /**
     * @returns the anchor date of the filter
     */
    readonly anchorDate?: Date;
    /**
     * @returns The date period of the filter (years, months, etc.).
     */
    readonly periodType: PeriodType;
    /**
     * @returns The range of the date filter.
     */
    readonly rangeType: DateRangeType;
    /**
     * @returns When getRange returns LASTN or NEXTN, this is the N value (how many years, months, etc.).
     */
    readonly rangeN?: number;
}
/**
 * The domain of range filter
 */
export interface RangeDomain {
    /**
     * @returns the domain type (relevant, all)
     */
    readonly type: FilterDomainType;
    /**
     * @returns  Minimum value as specified in the domain.
     */
    readonly min: DataValue;
    /**
     * @returns  Maximum value as specified in the domain.
     */
    readonly max: DataValue;
}
/**
 * The domain of a categorical filter
 */
export interface CategoricalDomain {
    /**
     * @returns the domain type (relevant, all)
     */
    readonly type: FilterDomainType;
    /**
     * @returns the list of values in the domain of the filter
     */
    readonly values: Array<DataValue>;
}
/**
 * A selected value in a hierarchical filter
 */
export interface HierarchicalFilterDataValue {
    /**
     * @returns the DataValue of the seleted item
     */
    value: DataValue;
    /**
     * @returns the path to this selected item. In the ByCategory example, the hierarchicalPath for a level 2 item could be
     * '[Outdoor & Sporting].[Bikes].[Kids' Bikes]'.
     */
    readonly hierarchicalPath: string;
    /**
     * @returns the level of this selected item. In the ByCategory example, the level could be 0-4.
     * For '[Outdoor & Sporting].[Bikes].[Kids' Bikes]', the level is 2.
     */
    level: number;
}
/**
 * Details about each level in a hierarchical filter
 */
export interface HierarchicalLevelDetail {
    /**
     * @returns the level name. In the ByCategory example, the name could be 'Family', 'Category', 'Subcategory', 'Brand', or 'Sku'.
     */
    name: string;
    /**
     * @returns the level selection state
     */
    levelSelectionState: HierarchicalLevelSelectionState;
}
//# sourceMappingURL=FilterInterfaces.d.ts.map