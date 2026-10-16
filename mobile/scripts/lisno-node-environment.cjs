// Expo embed preserves an inherited NODE_ENV. Match the bundle task's explicit mode instead.
// Other Node commands (for example source-map composition) have no --dev and are unchanged.
const devFlag = process.argv.indexOf('--dev');
if (devFlag !== -1 && ['true', 'false'].includes(process.argv[devFlag + 1])) {
  process.env.NODE_ENV = process.argv[devFlag + 1] === 'true' ? 'development' : 'production';
}
