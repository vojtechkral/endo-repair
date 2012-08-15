


(function(er, $, undefined)
{
  // = private =

  var trk;

  var map;
  var polys = new Array();

  var $dnd;
  var $map;
  var $openerror;

  var disp_max = 100;

  function read_error(text)
  {
    $openerror.html('Error: '+text);
  }

  function Trk(xml)
  {
    this.xml = xml;
    this.pts = new Array();
  }

  function Pt(lat, lon, ele, time)
  {
    this.lat = lat;
    this.lon = lon;
    this.ele = ele;
    this.time = time;
    this.view = false;
    this.latLng = new google.maps.LatLng(lat, lon);
    this.distFrom = function(latLng)
    {
      return google.maps.geometry.spherical.computeDistanceBetween(this.latLng, latLng);
    }
  }

  function load_gpx(file)
  {
    var reader = new FileReader();

    reader.onload = function(e)
    {
      var xml = $($.parseXML(e.target.result));

      xml.find('trk link').remove();

      if (!xml.children('gpx').length || !xml.children('gpx').children('metadata').length)
      {
        read_error('Not a GPX file');
        return;
      }

      trk = new Trk(xml);

      var meta = xml.find('metadata');
      var time = new Date(xml.find('trkpt').first().children('time').text());
      var xemail = meta.find('email').first();

      $('#trk_user').html(meta.find('name').text());
      $('#trk_email').html('('+xemail.attr('id')+'@'+xemail.attr('domain')+')');
      $('#trk_time').html(time.toLocaleDateString()+', '+time.toLocaleTimeString());

      xml.find('trkpt').each(function(i, ele)
      {
        var e = $(ele);
        var lat = parseFloat($(this).attr('lat'));
        var lon = parseFloat($(this).attr('lon'));
        var ele = parseFloat(e.children('ele').text());
        var time = new Date(e.children('time').text())
        trk.pts.push(new Pt(lat, lon, ele, time));
      });

      init_map();
    };

    reader.onerror = function()
    {
      read_error('Could not read the file');
    };

    reader.readAsText(file);
  }

  function init_map()
  {
    $dnd.hide();
    $map.show();

    var mapOptions =
    {
      zoom: 2,
      center: new google.maps.LatLng(0, 0),
      mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    map = new google.maps.Map($map[0], mapOptions);

    var bounds = new google.maps.LatLngBounds();
    for (var i = 0; i < trk.pts.length; i++) bounds.extend(trk.pts[i].latLng);
    map.fitBounds(bounds);

    polys = new Array();

    google.maps.event.addListener(map, 'idle', function()
    {
      draw_polys();
    });
  }

  function compute_pt(ptL, ptR, nLatLng)
  {
    var a = ptL.distFrom(nLatLng);
    var c = a+ptR.distFrom(nLatLng);

    var ele = ptL.ele + (a*(ptR.ele - ptL.ele))/c;

    var time = new Date();
    var tc = ptR.time.getTime() - ptL.time.getTime();
    time.setTime(ptL.time.getTime() + (a*tc)/c)

    return new Pt(nLatLng.lat(), nLatLng.lng(), ele, time);
  }

  function poly_bind(poly, idx)
  {
    var offset = idx;
    var path = poly.getPath();

    google.maps.event.addListener(path, 'insert_at', function(i)
    {
      p = offset+i;
      if (!p || (p >= (trk.pts.length-1))) return;

      var nPt = compute_pt(trk.pts[p-1], trk.pts[p], path.getAt(i));
      trk.pts.splice(p, 0, nPt);
    });

    google.maps.event.addListener(path, 'remove_at', function(i)
    {
      p = offset+i;
      if (p >= trk.pts.length) return;
      trk.pts.splice(p, 1);
    });

    google.maps.event.addListener(path, 'set_at', function(i)
    {
      p = offset+i;
      if (p >= trk.pts.length) return;

      var nPt;
      var n = path.getAt(i);

      if (p && (p < (trk.pts.length-1)))
      {
        nPt = compute_pt(trk.pts[p-1], trk.pts[p+1], n);
        trk.pts[p] = nPt;
      }
      else
      {
        trk.pts[p] = new Pt(n.lat(), n.lng(), trk.pts[p].ele, trk.pts[p].time);
      }
    });

    google.maps.event.addListener(poly, 'rightclick', function(e)
    {
      if (e.vertex) path.removeAt(e.vertex);
    });
  }

  function draw_polys()
  {
    for (var i = 0; i < polys.length; i++) polys[i].setPath(new Array());
    delete polys;
    polys = new Array();

    for (var i = 0; i < trk.pts.length; i++) trk.pts[i].view = false;

    var bounds = map.getBounds();
    var ptsvis = 0;
    var last = trk.pts.length-1;
    if (bounds.contains(trk.pts[0].latLng))
    {
      trk.pts[0].view = true;
      trk.pts[1].view = true;
    }
    for (var i = 1; i < last; i++)
    {
      if (bounds.contains(trk.pts[i].latLng))
      {
        trk.pts[i-1].view = true;
        trk.pts[i].view = true;
        trk.pts[i+1].view = true;
        ptsvis++;
      }
    }
    if (bounds.contains(trk.pts[last].latLng))
    {
      trk.pts[last].view = true;
      trk.pts[last-1].view = true;
    }

    var edit = ptsvis <= disp_max ? true : false;

    var inview = false;
    var ip = 0;
    for (var i = 0; i < trk.pts.length; i++)
    {
      if (inview != trk.pts[i].view)
      {
        inview = trk.pts[i].view;
        if (inview)
        {
          //create new poly:
          var poly = new google.maps.Polyline({strokeColor: "blue", strokeOpacity: 1.0, strokeWeight: 2, editable: edit});
          poly.erOffset = i;
          poly.setMap(map);
          poly.erIdx = i;
          polys.push(poly);
        }
        else
        {
          poly_bind(polys[ip], polys[ip].erIdx);
          ip++;
        }
      }
      if (inview)
      {
        polys[ip].getPath().push(trk.pts[i].latLng);
      }
    }
  }

  function save_gpx()
  {
    if (!trk.pts.length) return;

    //This is where jQuery's XML support gets quite ridiculous...

    $trk = trk.xml.find('trk').first();
    $trk.children('trkseg').remove();
    $trk.append($($.parseXML('<trkseg></trkseg>')).children());
    $seg = $trk.children('trkseg');

    for (var i = 0; i < (trk.pts.length-1); i++)
    {
      $seg.append($($.parseXML('<trkpt lat="'+trk.pts[i].lat+'" lon="'+trk.pts[i].lon+'">\n'+
        '  <time>'+trk.pts[i].time.toISOString()+'</time>\n'+
        (isNaN(trk.pts[i].ele) ? '' : '  <ele>'+trk.pts[i].ele+'</ele>\n')+
        '</trkpt>\n')).children());
    }

    var last = trk.pts.length-1;
    $trk.append($($.parseXML(
        '<trkseg><trkpt lat="'+trk.pts[last].lat+'" lon="'+trk.pts[last].lon+'">'+
        '<time>'+trk.pts[last].time.toISOString()+'</time></trkpt></trkseg>\n')).children());

    var xmlstring = '<?xml version="1.0" encoding="UTF-8"?>\n'+
    (new XMLSerializer().serializeToString(trk.xml.children()[0]));

    var uriContent = "data:application/octet-stream," + encodeURIComponent(xmlstring);
    location.href = uriContent;
  }

  function close()
  {
    if (!trk) return;
    var r = confirm("Really close the track?\nAny unsaved work will be lost");
    if (!r) return;

    $map.hide();
    $dnd.show();

    map = undefined;
    polys = undefined;
    trk = undefined;

    $('#trk_user').html('-');
    $('#trk_email').html('-');
    $('#trk_time').html('-');
  }

  function init()
  {
    $openerror = $("#openerror");
    $dnd = $("#dnd");
    $map = $("#map");

    $("#dnd").filedrop({callback: function(file)
    {
      load_gpx(file);
    }});

    $('#gpxinput').change(function(e)
    {
      e.preventDefault();
      load_gpx($('#gpxinput')[0].files[0]);
      $('#gpxinput').val('');
    });

    $('#save').click(function() {save_gpx();});
    $('#close').click(function() {close();});
  }

  // = public =

  // = code =
  $(document).ready(function()
  {
    init();
  });

}(window.er = window.er || {}, jQuery));
