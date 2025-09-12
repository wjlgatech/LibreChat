const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  devtool: false,
  entry: {
    'mediasoup-client': 'mediasoup-client'
  },
  output: {
    path: path.resolve(__dirname, 'src'),
    filename: '[name].bundle.js',
    library: 'mediasoupClient',
    libraryTarget: 'window'
  },
  resolve: {
    extensions: ['.js', '.json'],
    fallback: {
      "buffer": require.resolve("buffer/"),
      "process": require.resolve("process/browser"),
      "stream": require.resolve("stream-browserify"),
      "util": require.resolve("util/"),
      "events": require.resolve("events/"),
      "crypto": require.resolve("crypto-browserify"),
      "path": require.resolve("path-browserify"),
      "os": require.resolve("os-browserify/browser"),
      "fs": false,
      "net": false,
      "tls": false,
      "child_process": false
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ]
};