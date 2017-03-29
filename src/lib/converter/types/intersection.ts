import * as ts from 'typescript';

import {Type, IntersectionType} from '../../models/types/index';
import {Component, ConverterTypeComponent, TypeConverter} from '../components';
import {Context} from '../context';

@Component({name: 'type:intersection'})
export class IntersectionConverter extends ConverterTypeComponent implements TypeConverter<ts.IntersectionType, ts.IntersectionTypeNode> {
    /**
     * Test whether this converter can handle the given TypeScript node.
     */
    supportsNode(context: Context, node: ts.IntersectionTypeNode): boolean {
        return node.kind === ts.SyntaxKind.IntersectionType;
    }

    /**
     * Test whether this converter can handle the given TypeScript type.
     */
    supportsType(context: Context, type: ts.IntersectionType): boolean {
        return !!(type.flags & ts.TypeFlags.Intersection);
    }

    /**
     * Convert the given intersection type node to its type reflection.
     *
     * This is a node based converter, see [[convertIntersectionType]] for the type equivalent.
     *
     * ```
     * let someValue: string|number;
     * ```
     *
     * @param context  The context object describing the current state the converter is in.
     * @param node  The intersection type node that should be converted.
     * @returns The type reflection representing the given intersection type node.
     */
    convertNode(context: Context, node: ts.IntersectionTypeNode): IntersectionType {
        let types: Type[] = [];
        if (node.types) {
            types = node.types.map((n) => this.owner.convertType(context, n));
        } else {
            types = [];
        }

        return new IntersectionType(types);
    }

    /**
     * Convert the given intersection type to its type reflection.
     *
     * This is a type based converter, see [[convertIntersectionTypeNode]] for the node equivalent.
     *
     * ```
     * let someValue: string|number;
     * ```
     *
     * @param context  The context object describing the current state the converter is in.
     * @param type  The intersection type that should be converted.
     * @returns The type reflection representing the given intersection type.
     */
    convertType(context: Context, type: ts.IntersectionType): IntersectionType {
        let types: Type[];
        if (type && type.types) {
            types = type.types.map((t) => this.owner.convertType(context, null, t));
        } else {
            types = [];
        }

        return new IntersectionType(types);
    }
}
