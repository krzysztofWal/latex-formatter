'use strict';

import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');
import os = require('os');
var channel = null;

const fullRange = doc => doc.validateRange(new vscode.Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE));
const LATEX_MODE: vscode.DocumentFilter = { language: 'latex', scheme: 'file' };

export class OperatingSystem {
    public name;
    public file_ext;
    public checker;
    constructor(name: string, file_ext: string, checker: string) {
        this.name = name;
        this.file_ext = file_ext;
        this.checker = checker;
    }
}
const windows: OperatingSystem = new OperatingSystem('win32', '.exe', 'where');
const linux: OperatingSystem = new OperatingSystem('linux', '.pl', 'which');
const mac: OperatingSystem = new OperatingSystem('darwin', '.pl', 'which');

export class LaTexFormatter {
    private machine_os: string;
    private current_os: OperatingSystem;
    private formatter: string;
    private formatterPath: string;
    constructor() {
        this.machine_os = os.platform();
        console.log(this.machine_os);
        this.formatter = 'latexindent';
        this.formatterPath = '';
    }
    public formatDocument(document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            let filename = document.fileName;

            if (this.machine_os == windows.name) {
                this.current_os = windows;
            } else if (this.machine_os == linux.name) {
                this.current_os = linux;
            }  else if (this.machine_os == mac.name) {
                this.current_os = mac;
            }

            this.checkPath(this.condifyPath(this.current_os.checker)).then((res) => {
                if (!res) {
                    const condaEnv = this.getConfig().get('optionalCondaEnv') as string;
                    if (condaEnv && condaEnv.length > 0) {
                        showErrorMessage('Can not find latexindent in conda environment "' + condaEnv + '" (or conda/mamba itself is missing).');
                    } else {
                        showErrorMessage('Can not find latexindent in PATH!');
                    }
                    return resolve(null);
                }
                this.format(filename, document).then((res) => {
                    return resolve(res);
                });

            });
        });
    }
    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('latex-formatter');
    }
    private condifyPath(path: string): string {
        // add necessary prefixes to the formatter command if a conda environment is specified
        let config = this.getConfig();
        let condaEnv = config.get('optionalCondaEnv') as string;
            if (condaEnv && condaEnv.length > 0) {
                let exe = (config.get('condaExecutable') as string) || 'conda';
                path = exe + ' run -n ' + condaEnv + ' -- ' + path;
            }
            return path;
    }
    private checkPath(checker: string, candidate?: string): Thenable<boolean> {
        return new Promise((resolve) => {
            // Candidate is passed along instead of mutating this.formatter, so
            // repeated formats behave identically.
            candidate = candidate || this.formatterPath || this.formatter;
            cp.exec(checker + ' ' + candidate, (err, stdout, stderr) => {
                if (err || stdout.trim() == '') {
                    // Not found: try once with the OS-specific extension, then give up.
                    if (!candidate.endsWith(this.current_os.file_ext)) {
                        this.checkPath(checker, candidate + this.current_os.file_ext).then(resolve);
                    } else {
                        resolve(false);
                    }
                } else {
                    // Keep the exact binary that was verified ('where' on Windows
                    // may print several lines, take the first).
                    this.formatterPath = stdout.trim().split('\n')[0];
                    resolve(true);
                }
            });
        })

    }
    private format(filename: string, document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {            
            // Run the exact path verified by checkPath
            cp.exec(this.condifyPath('"' + this.formatterPath + '"') + ' "' + filename + '"', (err, stdout, stderr) => {
                if (stdout != '') {
                    var edit = [vscode.TextEdit.replace(fullRange(document), stdout)];
                    log('Formatted successfully: ' + filename + ' (using ' + this.formatterPath + ')');
                    return resolve(edit);
                }
                log('Formatter produced no output for: ' + filename + (stderr ? ' | stderr: ' + stderr.trim() : ''));
                return resolve(null);
            });
        });

    }
}

function showErrorMessage(msg:string) {
    vscode.window.showErrorMessage(msg);
    log(msg);
}

function log(msg: string) {
    if (channel) {
        channel.appendLine('[' + new Date().toISOString() + '] ' + msg);
    }
}

class LaTexDocumentRangeFormatter implements vscode.DocumentFormattingEditProvider {
    private formatter: LaTexFormatter;

    constructor() {
        this.formatter = new LaTexFormatter();
    }
    public provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions, token: vscode.CancellationToken):
        Thenable<vscode.TextEdit[]> {
        return document.save().then(() => {
            return this.formatter.formatDocument(document);
        });

    }
}

export function activate(context: vscode.ExtensionContext) {
    channel = vscode.window.createOutputChannel('latex-formatter');

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            LATEX_MODE, new LaTexDocumentRangeFormatter())
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
}