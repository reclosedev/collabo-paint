
$(window).ready(function () {
  var canvas, context, realCanvas, realContext;
  var tool;
  var tool_default = 'pencil';
  var sock;
  var $tool_color = $('#tool-color');
  var $tool_width = $('#tool-width');
  var connectSock = function () {
    console.log('connectSock');
    sock = new SockJS('http://' + window.location.host + '/drawing');
    sock.onopen = function () {
      console.log('opensock');
      var user = $("#storage").data("user-id");
      console.log(user);
      var cmd = {'event': 'hello', 'user_id': user};
      sock.send(JSON.stringify(cmd));
    };
    sock.onmessage = function (e) {
      console.log('message', e.data);
      var event = e.data.event;
      var data = e.data.data;
      if (event == 'draw') {
        var tool = new tools[data.tool]();
        tool.drawData(data);
      } else if (event == 'init') {
        realContext.clearRect(0, 0, canvas.width, canvas.height);
        $(data.drawing).each(function () {
          var tool = new tools[this.tool]();
          tool.drawData(this);
        });
        $("#users-list").html("");
        $(data.users).each(function () {
          addUser(this);
        });
      } else if (event == 'new-user') {
        addUser(data);
      } else if (event == 'start-drawing') {
        $("#user-" + data.user.id).addClass("active-user");
      } else if (event == 'end-drawing') {
        $("#user-" + data.user.id).removeClass("active-user");
      } else if (event == 'disconnected') {
        $("#user-" + data.user.id).remove();
      } else if (event == 'rename') {
        $("#user-" + data.user.id).html(data.user.name);
      }
    };
    sock.onclose = sock.onerror = function () {
      setTimeout(connectSock, 1000);
    };
  };
  var addUser = function (data) {
    $("#users-list").append(
      '<li id="user-' + data.user.id + '">' + data.user.name + '</li>');
  };
  $(window).bind('beforeunload', function (event) {
    sock.send(JSON.stringify({'event': 'disconnected'}));
  });
  $('#change-name').submit(function (e) {
    e.preventDefault();
    var newName = $('#user-name').val();
    sock.send(JSON.stringify({'event': 'rename',
                               'data': {'name': newName}}));
  });
  connectSock();

  function initCanvas() {
    realCanvas = document.getElementById('imageView');
    realContext = realCanvas.getContext('2d');
    // Add the temporary canvas.
    var container = realCanvas.parentNode;
    canvas = document.createElement('canvas');
    canvas.id = 'imageTemp';
    canvas.width = realCanvas.width;
    canvas.height = realCanvas.height;
    container.appendChild(canvas);
    context = canvas.getContext('2d');

    $('.tool-change').click(function (e) {
      e.preventDefault();
      var $el = $(this);
      var toolName = $el.data('tool');
      if (tools[toolName]) {
        tool = new tools[toolName]();
        $('.tool-change img').removeClass('highlighted');
        $el.children('img').addClass('highlighted');
      }
    });

    if (tools[tool_default]) {
      tool = new tools[tool_default]();
      $('.tool-change[data-tool=' + tool_default + '] img').addClass('highlighted');
    }
    
    // prevent i-beam cursor
    canvas.onselectstart = function () {
      return false;
    };

    $(canvas).bind('mousedown mousemove mouseup', function (e) {
      if (e.layerX || e.layerX == 0) { // Firefox
        e._x = e.layerX;
        e._y = e.layerY;
      } else if (e.offsetX || e.offsetX == 0) { // Opera
        e._x = e.offsetX;
        e._y = e.offsetY;
      }
      var func = tool[e.type];
      if (func) {
        func(e);
      }
    });
  }

  $tool_color.change(function (){
    context.strokeStyle = this.value;
  });
  $tool_width.change(function (){
    context.lineWidth = this.value;
  });

  function updateCanvas() {
    realContext.drawImage(canvas, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  var tools = {};
  // The drawing pencil.
  tools.pencil = function () {
    var self = this;
    this.started = false;
    this.points = [];

    this.mousedown = function (e) {
      sock.send('{"event": "start-drawing"}');
      context.beginPath();
      context.moveTo(e._x, e._y);
      self.started = true;
      self.points.push({x: e._x, y: e._y});
    };

    this.mousemove = function (e) {
      if (self.started) {
        context.lineTo(e._x, e._y);
        context.stroke();
        self.points.push({x: e._x, y: e._y});
      }
    };

    this.mouseup = function (e) {
      if (self.started) {
        self.mousemove(e);
        self.started = false;
        updateCanvas();
        var data = {
          'event': 'draw',
          'data': {
            'tool': 'pencil',
            'color': $tool_color.val(),
            'lw': $tool_width.val(),
            'points': self.points
          }
        };
        sock.send(JSON.stringify(data));
        sock.send('{"event": "end-drawing"}');
        self.points = [];
      }
    };
    // Draw by saved points
    this.drawData = function (data) {
      var points = data.points;
      if (points.length < 2)
        return;
      context.save();
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) {
        context.lineTo(points[i].x, points[i].y);
      }
      context.strokeStyle = data.color;
      context.lineWidth = data.lw;
      context.stroke();
      context.restore();
      updateCanvas();
    };
  };
  // The line tool.
  tools.line = function () {
    var tool = this;
    this.started = false;

    this.mousedown = function (e) {
      sock.send('{"event": "start-drawing"}');
      tool.started = true;
      tool.x0 = e._x;
      tool.y0 = e._y;
    };

    this.mousemove = function (e) {
      if (!tool.started) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.beginPath();
      context.strokeStyle = $tool_color.val();
      context.moveTo(tool.x0, tool.y0);
      context.lineTo(e._x, e._y);
      context.stroke();
      context.closePath();
    };

    this.mouseup = function (e) {
      if (!tool.started) return;
      tool.mousemove(e);
      tool.started = false;
      updateCanvas();
      var command = {
        'event': 'draw',
        'data': {
          'tool': 'line', 'color': $tool_color.val(),
          'lw': $tool_width.val(),
          'x0': tool.x0, 'y0': tool.y0,
          'x': e._x, 'y': e._y
        }
      };
      sock.send('{"event": "end-drawing"}');
      sock.send(JSON.stringify(command));
    };
    this.drawData = function (data) {
      console.log(data);
      context.save();
      context.beginPath();
      context.moveTo(data.x0, data.y0);
      context.lineTo(data.x, data.y);
      context.strokeStyle = data.color;
      context.lineWidth = data.lw;
      context.stroke();
      context.closePath();
      context.restore();
      updateCanvas();
    };
  };
  // The rectangle tool.
  tools.rect = function () {
    var self = this;
    this.started = false;

    this.mousedown = function (e) {
      sock.send('{"event": "start-drawing"}');
      self.started = true;
      self.x0 = e._x;
      self.y0 = e._y;
    };

    this.mousemove = function (e) {
      if (!self.started) {
        return;
      }

      var x = Math.min(e._x, self.x0),
        y = Math.min(e._y, self.y0),
        w = Math.abs(e._x - self.x0),
        h = Math.abs(e._y - self.y0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!w || !h) {
        return;
      }
      context.strokeRect(x, y, w, h);
    };

    this.mouseup = function (e) {
      if (!self.started) return;
      self.mousemove(e);
      self.started = false;
      updateCanvas();
      var x = Math.min(e._x, self.x0),
          y = Math.min(e._y, self.y0),
          w = Math.abs(e._x - self.x0),
          h = Math.abs(e._y - self.y0);
      var command = {
        'event': 'draw',
        'data': {
          'tool': 'rect', 'color': $tool_color.val(),
          'lw': $tool_width.val(),
          'x': x, 'y': y, 'w': w, 'h': h}
      };
      sock.send('{"event": "end-drawing"}');
      sock.send(JSON.stringify(command));
    };
    this.drawData = function (data) {
      context.save();
      context.strokeStyle = data.color;
      context.lineWidth = data.lw;
      context.strokeRect(data.x, data.y, data.w, data.h);
      context.restore();
      updateCanvas();
    };
  };

  // The circle tool.
  tools.circle = function () {
    var self = this;
    this.started = false;

    this.mousedown = function (e) {
      sock.send('{"event": "start-drawing"}');
      self.started = true;
      self.x0 = e._x;
      self.y0 = e._y;
    };

    this.mousemove = function (e) {
      if (!self.started) {
        return;
      }

      var w = Math.abs(e._x - self.x0),
        h = Math.abs(e._y - self.y0);
      var r = Math.sqrt(w * w + h * h);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!w || !h) {
        return;
      }
      context.save();
      context.beginPath();
      context.arc(self.x0, self.y0, r, 0, 2 * Math.PI, false);
      context.strokeStyle = $tool_color.val();
      context.stroke();
      context.closePath();
      context.restore();
    };

    this.mouseup = function (e) {
      if (!self.started) return;
      self.mousemove(e);
      self.started = false;
      updateCanvas();
      var w = Math.abs(e._x - self.x0),
        h = Math.abs(e._y - self.y0);
      var r = Math.sqrt(w * w + h * h);
      var command = {
        'event': 'draw',
        'data': {
          'tool': 'circle', 'color': $tool_color.val(),
          'lw': $tool_width.val(),
          'x': self.x0, 'y': self.y0, 'r': r
        }
      };
      sock.send('{"event": "end-drawing"}');
      sock.send(JSON.stringify(command));
    };
    this.drawData = function (data) {
      context.save();
      context.beginPath();
      context.arc(data.x, data.y, data.r, 0, 2 * Math.PI, false);
      context.lineWidth = data.lw;
      context.strokeStyle = data.color;
      context.stroke();
      context.closePath();
      context.restore();
      updateCanvas();
    };
  };
  initCanvas();
});

