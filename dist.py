import os
import json

def exec_command(cmd):
    print cmd
    os.system(cmd)

version = json.loads(open("metadata.json").read())['version']
contents = ["extension.js", "metadata.json", "prefs.js", "utils.js", "schemas/*"]

exec_command("glib-compile-schemas schemas")
exec_command("zip gajim@base-art.net-%d.zip %s" % (version, " ".join(contents)))
exec_command("git tag %d" % version)

