// Embedded Python for TuneBox on iOS: start the interpreter and call functions in tunebox_bridge.py.
#ifndef TBPython_h
#define TBPython_h

/// Runs a script in JavaScriptCore and returns what it printed (malloc'd), or NULL with *error set.
typedef char *_Nullable (*TBJsEvalCallback)(const char *_Nonnull script, char *_Nullable *_Nonnull error);
/// An output line from a running yt-dlp job.
typedef void (*TBEmitCallback)(const char *_Nonnull job, const char *_Nonnull line);

void tb_set_callbacks(TBJsEvalCallback _Nonnull jsEval, TBEmitCallback _Nonnull emit);

/// Starts Python with the standard library in `home` (the bundle's python folder) and the app code
/// in `appPath`. Returns NULL on success or an error message (malloc'd).
char *_Nullable tb_python_start(const char *_Nonnull home, const char *_Nonnull appPath);

/// Calls tunebox_bridge.<function>(*args) with string arguments from any thread. Returns the result
/// as a string (malloc'd); on a Python exception, *failed is set to 1 and the traceback is returned.
char *_Nonnull tb_python_call(const char *_Nonnull function, const char *_Nonnull const *_Nullable args,
                              int nargs, int *_Nonnull failed);

#endif
