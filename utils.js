/*
    Copyright (C) 2012, 2013  Philippe Normand.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const Gio = imports.gi.Gio;
const Extension = imports.misc.extensionUtils.getCurrentExtension();

function getSettings() {
    let dir = Extension.dir.get_child('schemas').get_path();
    let source = Gio.SettingsSchemaSource.new_from_directory(dir,
        Gio.SettingsSchemaSource.get_default(),
        false);

    if(!source) {
        throw new Error('Error Initializing the schema source');
    }

    let schema = source.lookup('org.gnome.shell.extensions.gajim', false);

    if(!schema) {
        throw new Error('Schema missing.');
    }

    return new Gio.Settings({settings_schema: schema});
}
