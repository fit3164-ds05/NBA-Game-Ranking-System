import { AnnotationType } from './Namespaces/Tableau';
/**
 * Represents an annotation in a worksheet.
 */
export interface Annotation {
    /**
     * @returns The formatted annotation as a HTML string. HTML is currently not accepted when adding an annotation.
     */
    annotationHTML: string;
    /**
     * @returns Unique id representing the annotation.
     */
    annotationId: number;
    /**
     * @returns The plain text of the annotation.
     */
    annotationText: string;
    /**
     * @returns The annotation type.
     */
    annotationType: AnnotationType;
    /**
     * @returns Unique tuple representing the mark that is being annotated. The tupleId will be 0 for Area or Point annotations.
     */
    tupleId: number;
}
//# sourceMappingURL=AnnotationInterfaces.d.ts.map