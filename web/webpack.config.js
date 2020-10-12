const path = require("path");
const child_process = require("child_process");
const CopyPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { InjectManifest } = require("workbox-webpack-plugin");
const webpack = require("webpack");

const mode = process.env.NODE_ENV || "development";
const prod = mode === "production";

const dist = path.resolve(__dirname, "dist");

const buildInfo = `v${child_process.execSync("git rev-list --count HEAD").toString()} (${child_process.execSync("git rev-parse --short HEAD").toString().trim()}${child_process.execSync("git diff --quiet || echo ', dirty'").toString().trim()})`;

module.exports = {
    mode,
    devtool: prod ? undefined : "cheap-source-map",
    entry: {
        bundle: ["./index.ts"]
    },
    output: {
        path: dist,
        filename: "[name].[contenthash].js",
        chunkFilename: "js/[name].[chunkhash].js",
    },
    devServer: {
        contentBase: dist,
    },
    plugins: [
        new CleanWebpackPlugin(),

        new HtmlWebpackPlugin({
            template: __dirname + "/index.html",
        }),

        new CopyPlugin({
            patterns: [
                path.resolve(__dirname, "static")
            ]
        }),

        new InjectManifest({
            swSrc: __dirname + "/sw.js",
            maximumFileSizeToCacheInBytes: 100 * 1000000, // 100mb
        }),

        // ignore Moment locales
        new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /asdf/),

        new webpack.DefinePlugin({
            __BUILD_INFO__: JSON.stringify(buildInfo),
        })
    ],
    resolve: {
        alias: {
            svelte: path.resolve("node_modules", "svelte")
        },
        extensions: [".mjs", ".js", ".svelte"],
        mainFields: ["svelte", "browser", "module", "main"]
    },
    module: {
        rules: [
            {
                test: /\.worker\.(j|t)s$/,
                use: { loader: 'worker-loader' },
            },
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
            {
                test: /\.svelte$/,
                use: {
                    loader: "svelte-loader",
                    options: {
                        emitCss: false,
                        hotReload: true
                    }
                }
            },
            {
                test: /\.css$/,
                use: [
                    "style-loader",
                    "css-loader"
                ]
            },
            {
                test: /\.html$/i,
                loader: "html-loader",
            },
            {
                test: /\.(png|mp3)$/i,
                use: [
                    {
                        loader: "file-loader",
                    },
                ],
            },
        ],
    },
    devServer: {
        index: "index.html",
        historyApiFallback: true,
    },
    optimization: {
        splitChunks: false
    },
    experiments: {
        asyncWebAssembly: true
    },
    // otherwise UMD modules try to use AMD
    amd: false,
};
