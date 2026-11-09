/**
 * Public entry point: the factory plus the types callers need to describe
 * their inputs. The React wrapper lives behind the "./react" subpath so this
 * bundle never pulls React in.
 */

export { createBlockMap } from "./blockMap";
export type { BlockClickEvent, BlockMap, BlockMapOptions } from "./blockMap";
export type { Progress } from "./state";
export type { PartialStyle, Theme } from "./colors";
export type { BlockRange, BlockRangeTuple, RangeInput } from "./ranges";
export type { BlockView } from "./view";
export type { AxisOptions, BlockScale } from "./axis";
