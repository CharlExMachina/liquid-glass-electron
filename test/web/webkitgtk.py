#!/usr/bin/env python3
"""test:web's window for WebKitGTK (GNOME Web's engine, and Tauri's on Linux): the URL given, until it's killed."""
import sys
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('WebKit', '6.0')
from gi.repository import Gtk, WebKit

def activate(app):
    view = WebKit.WebView()
    view.load_uri(sys.argv[1])
    window = Gtk.ApplicationWindow(application=app, default_width=900, default_height=700, child=view)
    window.present()

app = Gtk.Application()
app.connect('activate', activate)
app.run(None)
