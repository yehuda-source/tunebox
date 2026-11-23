#include "TBPython.h"

#define PY_SSIZE_T_CLEAN
#include <Python/Python.h>
#include <stdlib.h>
#include <string.h>

static TBJsEvalCallback js_eval_callback = NULL;
static TBEmitCallback emit_callback = NULL;

void tb_set_callbacks(TBJsEvalCallback jsEval, TBEmitCallback emit) {
    js_eval_callback = jsEval;
    emit_callback = emit;
}

// ---------- the _tunebox module (Python -> app) ----------

static PyObject *tb_js_eval(PyObject *self, PyObject *args) {
    const char *script;
    if (!PyArg_ParseTuple(args, "s", &script)) return NULL;
    if (!js_eval_callback) {
        PyErr_SetString(PyExc_RuntimeError, "JavaScriptCore is not available");
        return NULL;
    }
    char *error = NULL;
    char *out;
    // Solving can take seconds; let other Python threads run meanwhile.
    Py_BEGIN_ALLOW_THREADS
    out = js_eval_callback(script, &error);
    Py_END_ALLOW_THREADS
    if (!out) {
        PyErr_SetString(PyExc_RuntimeError, error ? error : "JavaScript failed");
        free(error);
        return NULL;
    }
    PyObject *result = PyUnicode_FromString(out);
    free(out);
    return result;
}

static PyObject *tb_emit(PyObject *self, PyObject *args) {
    const char *job, *line;
    if (!PyArg_ParseTuple(args, "ss", &job, &line)) return NULL;
    if (emit_callback) emit_callback(job, line);
    Py_RETURN_NONE;
}

static PyMethodDef tb_methods[] = {
    {"js_eval", tb_js_eval, METH_VARARGS, "Run a script in JavaScriptCore; returns its console output."},
    {"emit", tb_emit, METH_VARARGS, "Report an output line of a running job."},
    {NULL, NULL, 0, NULL},
};

static struct PyModuleDef tb_module = {PyModuleDef_HEAD_INIT, "_tunebox", NULL, -1, tb_methods};

static PyObject *PyInit__tunebox(void) { return PyModule_Create(&tb_module); }

// ---------- starting Python ----------

static char *status_error(PyStatus status) {
    const char *msg = status.err_msg ? status.err_msg : "unknown error";
    return strdup(msg);
}

char *tb_python_start(const char *home, const char *appPath) {
    PyPreConfig pre;
    PyPreConfig_InitIsolatedConfig(&pre);
    pre.utf8_mode = 1;
    PyStatus status = Py_PreInitialize(&pre);
    if (PyStatus_Exception(status)) return status_error(status);

    if (PyImport_AppendInittab("_tunebox", PyInit__tunebox) == -1) return strdup("Could not register _tunebox");

    PyConfig config;
    PyConfig_InitIsolatedConfig(&config);
    config.buffered_stdio = 0;
    config.write_bytecode = 0;
    config.install_signal_handlers = 1;
    config.module_search_paths_set = 1;

    char lib[2048], dynload[2048];
    snprintf(lib, sizeof lib, "%s/lib/python%d.%d", home, PY_MAJOR_VERSION, PY_MINOR_VERSION);
    snprintf(dynload, sizeof dynload, "%s/lib-dynload", lib);
    const char *paths[] = {lib, dynload, appPath};

    status = PyConfig_SetBytesString(&config, &config.home, home);
    if (PyStatus_Exception(status)) goto fail;
    for (int i = 0; i < 3; i++) {
        wchar_t *w = Py_DecodeLocale(paths[i], NULL);
        status = PyWideStringList_Append(&config.module_search_paths, w);
        PyMem_RawFree(w);
        if (PyStatus_Exception(status)) goto fail;
    }
    status = Py_InitializeFromConfig(&config);
    if (PyStatus_Exception(status)) goto fail;
    PyConfig_Clear(&config);
    // Hand the GIL back; every call takes it with PyGILState_Ensure.
    PyEval_SaveThread();
    return NULL;

fail:
    PyConfig_Clear(&config);
    return status_error(status);
}

// ---------- calling the bridge (app -> Python) ----------

static char *exception_text(void) {
    PyObject *exc = PyErr_GetRaisedException();
    PyObject *tb = PyImport_ImportModule("traceback");
    char *text = NULL;
    if (tb && exc) {
        PyObject *lines = PyObject_CallMethod(tb, "format_exception", "O", exc);
        PyObject *empty = PyUnicode_FromString("");
        PyObject *joined = lines ? PyUnicode_Join(empty, lines) : NULL;
        if (joined) text = strdup(PyUnicode_AsUTF8(joined));
        Py_XDECREF(joined);
        Py_XDECREF(empty);
        Py_XDECREF(lines);
    }
    if (!text && exc) {
        PyObject *s = PyObject_Str(exc);
        if (s) text = strdup(PyUnicode_AsUTF8(s));
        Py_XDECREF(s);
    }
    Py_XDECREF(tb);
    Py_XDECREF(exc);
    PyErr_Clear();
    return text ? text : strdup("Python error");
}

char *tb_python_call(const char *function, const char *const *args, int nargs, int *failed) {
    *failed = 0;
    PyGILState_STATE gil = PyGILState_Ensure();
    char *result = NULL;
    PyObject *module = PyImport_ImportModule("tunebox_bridge");
    PyObject *fn = module ? PyObject_GetAttrString(module, function) : NULL;
    PyObject *tuple = fn ? PyTuple_New(nargs) : NULL;
    for (int i = 0; tuple && i < nargs; i++) PyTuple_SET_ITEM(tuple, i, PyUnicode_FromString(args[i]));
    PyObject *value = tuple ? PyObject_CallObject(fn, tuple) : NULL;
    if (value) {
        PyObject *s = PyUnicode_Check(value) ? Py_NewRef(value) : PyObject_Str(value);
        if (s) result = strdup(PyUnicode_AsUTF8(s));
        Py_XDECREF(s);
    }
    if (!result) {
        *failed = 1;
        result = exception_text();
    }
    Py_XDECREF(value);
    Py_XDECREF(tuple);
    Py_XDECREF(fn);
    Py_XDECREF(module);
    PyGILState_Release(gil);
    return result;
}
