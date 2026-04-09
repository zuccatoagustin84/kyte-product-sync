/**
 * React 19 / @react-pdf/renderer v4 JSX compatibility shim.
 *
 * @react-pdf/renderer v4 declares its components as empty class bodies
 * (`class View extends React.Component<ViewProps> {}`). React 19's stricter
 * JSX element type checks reject these because the declared classes are
 * missing instance methods. Casting each component to `ComponentType` here
 * unblocks JSX usage while preserving the original prop types.
 */
import type {
  ComponentProps,
  ComponentType,
  PropsWithChildren,
  ReactElement,
} from "react";
import * as RPDF from "@react-pdf/renderer";

type Fix<C> = C extends ComponentType<infer P>
  ? ComponentType<PropsWithChildren<P>>
  : C extends abstract new (...args: infer _) => { props: infer P }
    ? ComponentType<PropsWithChildren<P>>
    : ComponentType<PropsWithChildren<ComponentProps<C & ComponentType>>>;

export const Document = RPDF.Document as unknown as Fix<typeof RPDF.Document>;
export const Page = RPDF.Page as unknown as Fix<typeof RPDF.Page>;
export const View = RPDF.View as unknown as Fix<typeof RPDF.View>;
export const Text = RPDF.Text as unknown as Fix<typeof RPDF.Text>;
export const Image = RPDF.Image as unknown as Fix<typeof RPDF.Image>;

export const StyleSheet = RPDF.StyleSheet;

// The upstream signature is `(element: ReactElement<DocumentProps>) => Promise<Buffer>`,
// which rejects wrapper components like <CatalogDocument/>. Loosen it.
export const renderToBuffer = RPDF.renderToBuffer as unknown as (
  element: ReactElement,
) => Promise<Buffer>;
