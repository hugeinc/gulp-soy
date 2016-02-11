var through = require("through"),
    gutil = require("gulp-util"),
    Buffer = require("buffer").Buffer,
    PluginError = gutil.PluginError,
    fs = require("fs"),
    os = require("os"),
    File = gutil.File,
    closureTemplates = require("closure-templates"),
    path = require("path"),
    spawn = require("child_process").spawn,
    md5 = require("MD5");

module.exports = function (options) {
    if (typeof options !== "object") {
        options = {};
    }

    var tmp = path.resolve(options.tmpDir || path.join(os.tmpdir(), "soy")),
        addSoyUtils = options.hasOwnProperty("soyutils") ? options.soyutils : true,
        compilerFlags = options.hasOwnProperty("compilerFlags") ? options.compilerFlags : [],
        useClosure = options.hasOwnProperty("useClosure") ? options.useClosure : false,
        soyUtilsFile = useClosure ? "soyutils_usegoog.js" : "soyutils.js",
        soyUtils = path.resolve(closureTemplates[soyUtilsFile]),
        compiler = path.resolve(closureTemplates["SoyToJsSrcCompiler.jar"]),
        files = [];

    function write (file){
        if (!file.isNull()) {
            if (file.isStream()) {
                this.emit("error", new PluginError("gulp-soy",  "Streaming not supported"));
            } else {
                files.push(file);
            }
        }
    }

    function build(self, input, output, callback) {
        var cp,
            stderr = "",
            args = [].concat(
                "-classpath",
                compiler,
                "com.google.template.soy.SoyToJsSrcCompiler",
                "--codeStyle",
                "concat",
                compilerFlags,
                "--outputPathFormat",
                output,
                input
            );

        cp = spawn("java", args);

        cp.stderr.on("data", function (data) {
            stderr += data
        });

        cp.on("exit", function (exitCode) {
            if (exitCode) {
                console.error("Compile error\n", stderr);
                self.emit("compile", new Error("Error compiling templates"), false);
                self.emit("end");
            } else {
                callback();
            }
        });
    }

    function end() {
        var self = this,
            count = 0,
            compiled = [];

        function newFile(file, contentPath) {
            compiled.push(new File({
                cwd: file.cwd,
                base: file.base,
                path: file.path.replace(/\.soy$/, ".js"),
                contents: new Buffer(fs.readFileSync(contentPath, "utf8"))
            }));
            count += 1;
            if (count === files.length) {
                if (addSoyUtils) {
                    self.emit("data",
                        new File({
                            cwd: file.cwd,
                            base: file.base,
                            path: path.join(file.base, "soyutils.js"),
                            contents: new Buffer(fs.readFileSync(soyUtils, "utf8"))
                        })
                    );
                }
                compiled.forEach(function (file) {
                    self.emit("data", file);
                });
                self.emit("end");
            }
        }

        files.forEach(function (file) {
            var hash = md5(file.contents.toString()),
                pathHash = path.join(tmp, hash),
                callback = function () {
                    newFile(file, pathHash);
                };

            if (fs.existsSync(pathHash)) {
                callback();
            } else {
                build(self, file.path, pathHash, callback);
            }
        });
    }

    return through(write, end);
};
