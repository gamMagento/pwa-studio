const execa = require('execa');
const path = require('path');
const Multispinner = require('multispinner');
const sane = require('sane');

const rootDir = path.resolve(__dirname, '..');

const localDir = path.join(rootDir, 'node_modules/.bin');

const prerequisites = ['@magento/peregrine', '@magento/pwa-buildpack'];

const requiresDevServerRestart = [
    'packages/pwa-buildpack/dist/**/*.js',
    'packages/peregrine/dist/**/*.js',
    'packages/upward-js/lib/**/*.js',
    'packages/venia-concept/*.{js,json,yml}',
    'packages/venia-concept/.babelrc',
    'packages/venia-concept/.env',
    'packages/venia-concept/templates/**/*'
];

let veniaWatch;
function runVeniaWatch() {
    if (veniaWatch) {
        veniaWatch.on('close', runVeniaWatch);
        veniaWatch.kill('SIGINT');
        return;
    }
    veniaWatch = execa(
        'webpack-dev-server',
        ['--progress', '--color', '--env.phase', 'development'],
        {
            cwd: path.join(rootDir, 'packages/venia-concept'),
            localDir: path.join(rootDir, 'node_modules/.bin'),
            stdio: 'inherit'
        }
    );
}

function buildPrerequisites() {
    const spinner = new Multispinner(prerequisites, {
        preText: 'initial build of'
    });
    return execa(
        'lerna',
        [`--scope={${prerequisites.join(',')}}`, 'run', 'build'],
        {
            localDir
        }
    ).then(
        () => {
            prerequisites.forEach(dep => spinner.success(dep));
        },
        e => {
            const failedDeps = prerequisites.filter(
                dep => e.toString().indexOf(dep) !== -1
            );
            if (failedDeps.length === 0) {
                // something unexpected happened
                prerequisites.forEach(dep => spinner.error(dep));
            } else {
                failedDeps.forEach(dep => spinner.error(dep));
            }
            throw e;
        }
    );
}

function watchRestartRequirements() {
    return sane(rootDir, {
        glob: requiresDevServerRestart,
        ignored: '**/__*__/**/*',
        watchexec: true
    });
}

function watchVeniaWithRestarts() {
    const watcher = watchRestartRequirements();
    ['ready', 'change', 'add', 'delete'].forEach(eventName =>
        watcher.on(eventName, runVeniaWatch)
    );
}

buildPrerequisites()
    .then(watchVeniaWithRestarts)
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
