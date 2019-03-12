'use babel';

import { CompositeDisposable } from 'atom'
import fs from 'fs'

export default {

    config: {
        namespaceStyle: {
            title: 'Namespace style',
            order: 1,
            type: 'string',
            default: 'psr-2',
            enum: [
                { value: 'same-line', description: 'Same line as PHP tag' },
                { value: 'next-line', description: 'Next line after PHP tag' },
                { value: 'psr-2', description: 'One blank line after PHP tag (PSR-2)' }
            ]
        },
        includeClassDefinition: {
            title: 'Include class definition',
            order: 2,
            type: 'boolean',
            default: true
        }
    },

    subscriptions: null,

    namespaces: null,

    activate(state) {
        this.subscriptions = new CompositeDisposable()

        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'php-namespace-monkey:reload-namespaces': () => this.loadNamespaces()
        }))

        this.loadNamespaces()

        let subscription = atom.project.onDidAddBuffer(buffer => {
            this.addBoilerplate(buffer)

            if (! buffer.file) {
                let subscription = buffer.onDidSave(ev => {
                    this.addBoilerplate(buffer)
                    subscription.dispose()
                })
            }
        })

        this.subscriptions.add(subscription)
    },

    deactivate() {
        this.subscriptions.dispose()
    },

    addBoilerplate(buffer) {
        if (! buffer.file || ! this.isPhpClassFile(buffer.file.path) || ! buffer.isEmpty()) return

        fs.stat(buffer.file.path, (err, stats) => {
            if (err !== null) return

            if (Date.now() - stats.ctime.getTime() > 1000) return

            let namespace = this.resolveNamespace(buffer)
            let className = this.resolveClassName(buffer.file.path)

            if (! namespace) return

            let namespaceStyle = atom.config.get('php-namespace-monkey.namespaceStyle')

            if (namespaceStyle == 'same-line') {
                buffer.append(`<?php namespace ${namespace};\n`)
            } else if (namespaceStyle == 'next-line') {
                buffer.append(`<?php\nnamespace ${namespace};\n`)
            } else if (namespaceStyle == 'psr-2') {
                buffer.append(`<?php\n\nnamespace ${namespace};\n`)
            }

            if (atom.config.get('php-namespace-monkey.includeClassDefinition')) {
                buffer.append(`\nclass ${className}\n{\n}\n`)
            }
        })
    },

    loadNamespaces() {
        this.namespaces = []

        atom.project.getPaths().forEach(path => {
            let composerJsonPath = path + '/composer.json'

            if (! fs.existsSync(composerJsonPath)) return

            let composerJson

            try {
                composerJson = JSON.parse(fs.readFileSync(composerJsonPath))
            } catch (e) {
                return
            }

            if (! composerJson.autoload) return

            [ "psr-0", "psr-4" ].forEach(key => {

                let autoloadData = null

                try {
                  autoloadData = composerJson.autoload[key]
                } catch (e) {
                }

                if (! autoloadData) return

                Object.keys(autoloadData).forEach(namespace => {
                    if (! namespace) return

                    let paths = autoloadData[namespace]

                    if (! (paths instanceof Array)) paths = [ paths ]

                    paths.forEach(path => {
                        if (! path.endsWith('/')) path += '/'

                        this.namespaces.push({ path, namespace })
                    })
                })
            })
        })

        this.namespaces = this.namespaces.sort((a, b) => b.path.length - a.path.length)
    },

    isPhpClassFile(path) {
        let fileName = path.split('/').slice(-1)[0]
        return fileName.length > 0 && path.endsWith('.php')
    },

    resolveNamespace(buffer) {

        path = buffer.file.path

        // from Coffeescript: https://discuss.atom.io/t/project-folder-path-of-opened-file/24846/13
        var projectPath, ref, ref1, ref2, relativePath;

        if (!((ref = buffer) != null ? (ref1 = ref.file) != null ? ref1.path : void 0 : void 0)) {
          return
        }

        ref2 = atom.project.relativizePath(buffer.file.path), projectPath = ref2[0], relativePath = ref2[1];

        path = path.replace(projectPath + '/', '')

        let namespace = this.namespaces.find(namespace => {
            return path.startsWith(namespace.path)
        })

        if (! namespace) return

        let subnamespace = path.replace(namespace.path, '')
            .replace('.php', '')
            .split('/')
            .slice(0, -1)
            .join('\\')

        return (namespace.namespace + subnamespace).replace(/\\$/, '')
    },

    resolveClassName(path) {
        return path.replace('.php', '').split('/').slice(-1)[0]
    }
}
