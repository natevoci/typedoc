import * as ShellJS from 'shelljs';
import * as Path from 'path';

import {SourceReference} from '../../models/sources/file';
import {Component, ConverterComponent} from '../components';
import {BasePath} from '../utils/base-path';
import {Converter} from '../converter';
import {Context} from '../context';

// This should be removed when @typings/shelljs typings are updated to the shelljs version being used
declare module 'shelljs' {
    // `stdout` was added in:
    // https://github.com/shelljs/shelljs/commit/8a7f7ceec4d3a77a9309d935755675ac368b1eda#diff-c3bfabb5e6987aa21bc75ffd95a162d6
    // As of 2016-10-16, DefinitelyTyped's defs are for shelljs v0.3.0, but we're on 0.7.0
    interface ExecOutputReturnValue {
        stdout: string;
        stderr: string;
    }
}

/**
 * Stores data of a repository.
 */
class Repository {
    /**
     * The root path of this repository.
     */
    path: string;

    /**
     * The name of the branch this repository is on right now.
     */
    branch = 'master';

    /**
     * A list of all files tracked by the repository.
     */
    files: string[] = [];

    /**
     * The user/organisation name of this repository on GitHub.
     */
    gitHubUser: string;

    /**
     * The project name of this repository on GitHub.
     */
    gitHubProject: string;

    /**
     * Create a new Repository instance.
     *
     * @param path  The root path of the repository.
     */
    constructor(path: string) {
        this.path = path;
        ShellJS.pushd(path);

        let out = <ShellJS.ExecOutputReturnValue> ShellJS.exec('git ls-remote --get-url', {silent: true});
        if (out.code === 0) {
            let url: RegExpExecArray;
            const remotes = out.stdout.split('\n');
            for (let i = 0, c = remotes.length; i < c; i++) {
                url = /github\.com[:\/]([^\/]+)\/(.*)/.exec(remotes[i]);
                if (url) {
                    this.gitHubUser = url[1];
                    this.gitHubProject = url[2];
                    if (this.gitHubProject.substr(-4) === '.git') {
                        this.gitHubProject = this.gitHubProject.substr(0, this.gitHubProject.length - 4);
                    }
                    break;
                }
            }
        }

        out = <ShellJS.ExecOutputReturnValue> ShellJS.exec('git ls-files', {silent: true});
        if (out.code === 0) {
            out.stdout.split('\n').forEach((file) => {
                if (file !== '') {
                    this.files.push(BasePath.normalize(path + '/' + file));
                }
            });
        }

        out = <ShellJS.ExecOutputReturnValue> ShellJS.exec('git rev-parse --short HEAD', {silent: true});
        if (out.code === 0) {
            this.branch = out.stdout.replace('\n', '');
        }

        ShellJS.popd();
    }

    /**
     * Check whether the given file is tracked by this repository.
     *
     * @param fileName  The name of the file to test for.
     * @returns TRUE when the file is part of the repository, otherwise FALSE.
     */
    contains(fileName: string): boolean {
        return this.files.indexOf(fileName) !== -1;
    }

    /**
     * Get the URL of the given file on GitHub.
     *
     * @param fileName  The file whose GitHub URL should be determined.
     * @returns An url pointing to the web preview of the given file or NULL.
     */
    getGitHubURL(fileName: string): string {
        if (!this.gitHubUser || !this.gitHubProject || !this.contains(fileName)) {
            return null;
        }

        return [
            'https://github.com',
            this.gitHubUser,
            this.gitHubProject,
            'blob',
            this.branch,
            fileName.substr(this.path.length + 1)
        ].join('/');
    }

    /**
     * Try to create a new repository instance.
     *
     * Checks whether the given path is the root of a valid repository and if so
     * creates a new instance of [[Repository]].
     *
     * @param path  The potential repository root.
     * @returns A new instance of [[Repository]] or NULL.
     */
    static tryCreateRepository(path: string): Repository {
        ShellJS.pushd(path);
        const out = <ShellJS.ExecOutputReturnValue> ShellJS.exec('git rev-parse --show-toplevel', {silent: true});
        ShellJS.popd();

        if (out.code !== 0) {
            return null;
        }
        return new Repository(BasePath.normalize(out.stdout.replace('\n', '')));
    }
}

/**
 * A handler that watches for repositories with GitHub origin and links
 * their source files to the related GitHub pages.
 */
@Component({name: 'git-hub'})
export class GitHubPlugin extends ConverterComponent {
    /**
     * List of known repositories.
     */
    private repositories: {[path: string]: Repository} = {};

    /**
     * List of paths known to be not under git control.
     */
    private ignoredPaths: string[] = [];

    /**
     * Create a new GitHubHandler instance.
     *
     * @param converter  The converter this plugin should be attached to.
     */
    initialize() {
        ShellJS.config.silent = true;
        if (ShellJS.which('git')) {
            this.listenTo(this.owner, Converter.EVENT_RESOLVE_END, this.onEndResolve);
        }
    }

    /**
     * Check whether the given file is placed inside a repository.
     *
     * @param fileName  The name of the file a repository should be looked for.
     * @returns The found repository info or NULL.
     */
    private getRepository(fileName: string): Repository {
        // Check for known non-repositories
        const dirName = Path.dirname(fileName);
        for (let i = 0, c = this.ignoredPaths.length; i < c; i++) {
            if (this.ignoredPaths[i] === dirName) {
                return null;
            }
        }

        // Check for known repositories
        for (let path in this.repositories) {
            if (!this.repositories.hasOwnProperty(path)) {
                continue;
            }
            if (fileName.substr(0, path.length) === path) {
                return this.repositories[path];
            }
        }

        // Try to create a new repository
        const repository = Repository.tryCreateRepository(dirName);
        if (repository) {
            this.repositories[repository.path] = repository;
            return repository;
        }

        // No repository found, add path to ignored paths
        const segments = dirName.split('/');
        for (let i = segments.length; i > 0; i--) {
            this.ignoredPaths.push(segments.slice(0, i).join('/'));
        }

        return null;
    }

    /**
     * Triggered when the converter has finished resolving a project.
     *
     * @param context  The context object describing the current state the converter is in.
     */
    private onEndResolve(context: Context) {
        const project = context.project;
        project.files.forEach((sourceFile) => {
            const repository = this.getRepository(sourceFile.fullFileName);
            if (repository) {
                sourceFile.url = repository.getGitHubURL(sourceFile.fullFileName);
            }
        });

        for (let key in project.reflections) {
            const reflection = project.reflections[key];
            if (reflection.sources) {
                reflection.sources.forEach((source: SourceReference) => {
                    if (source.file && source.file.url) {
                        source.url = source.file.url + '#L' + source.line;
                    }
                });
            }
        }
    }
}
