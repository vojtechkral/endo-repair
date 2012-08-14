


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

  function Trk(time, xml)
  {
    this.time = time;
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

  function load_tcx(file)
  {
    var reader = new FileReader();

    reader.onload = function(e)
    {
      var xml = $($.parseXML(e.target.result));

      if (!xml.children('TrainingCenterDatabase').length)
      {
        read_error('Not a TCX file');
        return;
      }

      var time = new Date(xml.find('Lap').attr('StartTime'));

      trk = new Trk(time, xml);

      $('#trk_sport').html('Sport: '+xml.find('Activity').attr('Sport'));
      $('#trk_dist').html('Distance: '+xml.find('DistanceMeters').text()+' m');
      $('#trk_time').html('Time: '+xml.find('TotalTimeSeconds').text()+' s');
      $('#trk_cal').html('Energy: '+xml.find('Calories').text()+' cal');
      $('#trk_date').html(time.toLocaleDateString()+', '+time.toLocaleTimeString());
      $('#trk_cmnt').html(xml.find('Notes').text());

      xml.find('Trackpoint').each(function(i)
      {
        var $pos = $(this).children('Position');
        var lat = parseFloat($pos.children('LatitudeDegrees').text());
        var lon = parseFloat($pos.children('LongitudeDegrees').text());
        var ele = parseFloat($(this).children('AltitudeMeters').text());
        var time = new Date($(this).children('Time').text())
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

  function save_tcx()
  {
    if (!trk.pts.length) return;

    //This is where jQuery's XML support gets quite ridiculous...

    trk.xml.find('Track').remove();       // To remove any extra tracks and also to avoid loads of blank lines...
    trk.xml.find('Lap').append($($.parseXML('<Track>\n</Track>\n')).children());
    $trk = trk.xml.find('Track').first();
    $trk.children('Trackpoint').remove();

    for (var i = 0; i < (trk.pts.length-1); i++)
    {
      $trk.append($($.parseXML(
        '          <Trackpoint>\n'+
        '            <Time>'+trk.pts[i].time.toISOString()+'</Time>\n'+
        '            <Position>\n'+
        '              <LatitudeDegrees>'+trk.pts[i].lat+'</LatitudeDegrees>\n'+
        '              <LongitudeDegrees>'+trk.pts[i].lon+'</LongitudeDegrees>\n'+
        '            </Position>\n'+
        (isNaN(trk.pts[i].ele) ? '' : '            <AltitudeMeters>'+trk.pts[i].ele+'</AltitudeMeters>\n')+
        '          </Trackpoint>\n')).children());
    }

    var xmlstring = '<?xml version="1.0" encoding="UTF-8"?>\n'+
    (new XMLSerializer().serializeToString(trk.xml.children()[0]));

    var uriContent = "data:application/octet-stream," + encodeURIComponent(xmlstring);
    location.href = uriContent;
  }

  function close()
  {
    var r = confirm("Really close the track?\nAny unsaved work will be lost");
    if (!r) return;

    $map.hide();
    $dnd.show();

    delete map;
    delete polys;
    delete trk;
  }

  function init()
  {
    $openerror = $("#openerror");
    $dnd = $("#dnd");
    $map = $("#map");

    $("#dnd").filedrop({callback: function(file)
    {
      load_tcx(file);
    }});

    $('#fileinput').change(function(e)
    {
      e.preventDefault();
      load_tcx($('#fileinput')[0].files[0]);
    });

    $('#save').click(function() {save_tcx();});
    $('#close').click(function() {close();});
  }

  // = public =

  // = code =
  $(document).ready(function()
  {
    init();
  });

}(window.er = window.er || {}, jQuery));
