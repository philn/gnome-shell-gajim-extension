#
#    Copyright (C) 2012, 2013  Philippe Normand.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.

import os
import json
import zipfile
import glob

def exec_command(cmd):
    print cmd
    os.system(cmd)

version = json.loads(open("metadata.json").read())['version']

exec_command("glib-compile-schemas schemas")

contents = ["COPYING", "README.rst", "extension.js", "metadata.json", "prefs.js", "utils.js"] + glob.glob("schemas/*")

with zipfile.ZipFile("gajim@base-art.net-%d.zip" % version, 'w') as myzip:
    for file in contents:
        print "Packing ", file
        myzip.write(file)

exec_command("git tag %d" % version)

