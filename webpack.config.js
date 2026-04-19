const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    // Each entry point becomes its own output bundle
    "popup/popup": "./src/popup/popup.ts",
    background: "./src/background/background.ts",
    content: "./src/content/content.ts",
    viewer: "./src/viewer/viewer.ts",
  },

  output: {
    // dist/ is the folder Chrome will load
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true, // wipe dist/ before each build
    // Must be explicit for Chrome extensions — "auto" causes
    // chrome-extension://invalid/ requests when the extension reloads
    publicPath: "",
  },

  resolve: {
    extensions: [".ts", ".js"],
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].css",
    }),

    // Generate popup/popup.html in dist — inject the bundled JS automatically
    new HtmlWebpackPlugin({
      template: "./src/popup/popup.html",
      filename: "popup/popup.html",
      chunks: ["popup/popup"],
    }),

    // Cache viewer page
    new HtmlWebpackPlugin({
      template: "./src/viewer/viewer.html",
      filename: "viewer.html",
      chunks: ["viewer"],
      inject: true,
    }),

    // Copy static assets that webpack doesn't process
    new CopyPlugin({
      patterns: [
        // manifest.json
        { from: "src/manifest.json", to: "manifest.json" },
        // Icons — place placeholder PNGs in src/icons/ or swap with your own
        { from: "src/icons", to: "icons", noErrorOnMissing: true },
      ],
    }),
  ],

  // Produce source maps in development for easy debugging
  devtool: process.env.NODE_ENV === "production" ? false : "inline-source-map",

  // Required for Chrome extension environment — no eval() allowed
  optimization: {
    minimize: true,
  },
};
