# -*- coding: utf-8 -*-
import uuid
import logging
import itertools

import tornado.ioloop
from tornado import web
from tornado.escape import xhtml_escape
from sockjs.tornado import SockJSConnection, SockJSRouter, proto


log = logging.getLogger('drawing')


class IndexHandler(web.RequestHandler):
    def get(self):
        self.render('index.html')


class Dispatcher(object):

    def __init__(self):
        self._handlers = {}

    def dispatch(self, instance, msg):
        log.info(msg)
        command = proto.json_decode(msg)
        event = command.get('event')
        data = command.get('data')
        handler = self._handlers.get(event)
        if not handler:
            log.warning('Unknown event %s', event)
            return
        handler(instance, command, data)

    def handles(self, *events):
        def decorator(func):
            for event in events:
                self._handlers[event] = func
            return func
        return decorator


class DrawingConnection(SockJSConnection):
    clients = set()
    drawing = []
    guest_counter = itertools.count(1)
    dispatcher = Dispatcher()

    def __init__(self, session):
        self.user_id = ""
        self.user_name = ""
        super(DrawingConnection, self).__init__(session)

    def on_open(self, info):
        self.clients.add(self)

    def on_message(self, msg):
        self.dispatcher.dispatch(self, msg)

    def on_close(self):
        self.clients.remove(self)
        command = {'event': 'disconnected', 'data': self.user_as_dict}
        self.on_status(command, self.user_as_dict)

    @dispatcher.handles('hello')
    def on_hello(self, command, data):
        self.user_id = random_string()
        self.user_name = 'Guest%s' % next(self.guest_counter)
        self.send_to_others({'event': 'new-user',
                             'data': self.user_as_dict})
        users = [c.user_as_dict for c in self.clients]
        init_cmd = {
            'event': 'init',
            'data': {'drawing': self.drawing, 'users': users}
        }
        self.send(init_cmd)

    @dispatcher.handles('draw')
    def on_draw(self, command, data):
        self.send_to_others(command)
        self.drawing.append(data)

    @dispatcher.handles('start-drawing', 'end-drawing', 'disconnected')
    def on_status(self, command, data):
        command['data'] = self.user_as_dict
        self.send_to_others(command)

    @dispatcher.handles('rename')
    def on_rename(self, command, data):
        name = data.get('name')
        if not name:
            return
        self.user_name = xhtml_escape(name)
        command['data'] = self.user_as_dict
        self.broadcast(self.clients, command)

    def send_to_others(self, message):
        self.broadcast(self.clients - {self}, message)

    @property
    def user_as_dict(self):
        return {'user': {'id': self.user_id, 'name': self.user_name}}


DrawingRouter = SockJSRouter(DrawingConnection, '/drawing')


def random_string():
    return uuid.uuid4().hex

if __name__ == "__main__":
    logging.getLogger().setLevel(logging.DEBUG)

    app = web.Application(
        [(r"/", IndexHandler),
         (r'/static/(.*)', web.StaticFileHandler, {'path': 'static'})] +
        DrawingRouter.urls
    )
    app.settings['cookie_secret'] = '123'
    app.listen(8080)
    print 'Listening on 0.0.0.0:8080'
    tornado.ioloop.IOLoop.instance().start()

# TODO eraser
# TODO rooms