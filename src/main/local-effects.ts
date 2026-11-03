import { Schema } from "effect";
import { causeHelpers } from "../backend/effect-boundary";

export class LocalOperationFailure extends Schema.TaggedError<LocalOperationFailure>()("LocalOperationFailure", {
  cause: Schema.Defect(),
}) {}

export const { io: localIO, sync: localSync, rewrap: toLocalOperationFailure } = causeHelpers(LocalOperationFailure);
