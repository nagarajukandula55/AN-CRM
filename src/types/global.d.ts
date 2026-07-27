import type mongoose from "mongoose";

declare global {
  // eslint-disable-next-line no-var
  var nativeConn: mongoose.Connection | undefined;
}

export {};
