const TerserPlugin = require('terser-webpack-plugin');
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './main.js',
  output: {
    filename: 'main.min.js',
    path: path.resolve(__dirname, './')
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      terserOptions: {
        compress: {
          drop_console: true, // Retire les console.log
          drop_debugger: true
        },
        mangle: true, // Renomme les variables
        format: {
          comments: false // Retire les commentaires
        }
      },
      extractComments: false
    })]
  }
};