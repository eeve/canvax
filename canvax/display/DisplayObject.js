/**
 * Canvax
 *
 * @author 释剑 (李涛, litao.lt@alibaba-inc.com)
 *
 * 模拟as3 DisplayList 的 现实对象基类
 */


KISSY.add("canvax/display/DisplayObject" , function(S , EventDispatcher , Matrix , Point , Base , HitTestPoint , propertyFactory){

    var DisplayObject = function(opt){
        arguments.callee.superclass.constructor.apply(this, arguments);
        var self = this;

        //如果用户没有传入context设置，就默认为空的对象
        opt      = Base.checkOpt( opt );

        //设置默认属性
        self.id  = opt.id || null;

        //相对父级元素的矩阵
        self._transform      = null;


        //心跳次数
        self._heartBeatNum   = 0;

        //元素对应的stage元素
        self.stage           = null;

        //元素的父元素
        self.parent          = null;

        self._eventEnabled   = false; //是否响应事件交互

        self.dragEnabled     = false;   //是否启用元素的拖拽

        //创建好context
        self._createContext( opt );

        var UID = Base.createId(self.type);


        //如果没有id 则 沿用uid
        if(self.id == null){
            self.id = UID ;
        }

        self.init.apply(self , arguments);


        //所有属性准备好了后，先要计算一次this._updateTransform()得到_tansform
        this._updateTransform();

    };
    
    Base.creatClass( DisplayObject , EventDispatcher , {
    //DisplayObject.prototype = {
        init : function(){
            //TODO: 这个方法由各派生类自己实现
        },
        _createContext : function( opt ){
            var self = this;
            //所有显示对象，都有一个类似canvas.context类似的 context属性
            //用来存取改显示对象所有和显示有关的属性，坐标，样式等。
            //该对象为Coer.propertyFactory()工厂函数生成
            self.context = null;

            //提供给Coer.propertyFactory() 来 给 self.context 设置 propertys
            var _contextATTRS = {
                width         : opt.context.width         || 0,
                height        : opt.context.height        || 0,
                x             : opt.context.x             || 0,
                y             : opt.context.y             || 0,
                alpha         : opt.context.alpha         || 1,
                scaleX        : opt.context.scaleX        || 1,
                scaleY        : opt.context.scaleY        || 1,
                scaleOrigin   : opt.context.scaleOrigin   || {
                  x : 0,
                  y : 0
                },
                rotation      : opt.context.rotation      || 0,
                rotateOrigin  : opt.context.rotateOrigin  ||  {
                  x:0,
                  y:0
                },
                visible       : opt.context.visible       || true,
                cursor        : opt.context.cursor        || "default"
            };


            var _context2D_context = {
                //canvas context 2d 的 系统样式。目前就知道这么多
                fillStyle     : opt.context.fillStyle      || null,
                lineCap       : opt.context.lineCap        || null,
                lineJoin      : opt.context.lineJoin       || null,
                lineWidth     : opt.context.lineWidth      || null,
                miterLimit    : opt.context.miterLimit     || null,
                shadowBlur    : opt.context.shadowBlur     || null,
                shadowColor   : opt.context.shadowColor    || null,
                shadowOffsetX : opt.context.shadowOffsetX  || null,
                shadowOffsetY : opt.context.shadowOffsetY  || null,
                strokeStyle   : opt.context.strokeStyle    || null,
                //globalAlpha   : opt.context.globalAlpha    || null,
                font          : opt.context.font           || null,
                textAlign     : opt.context.textAlign      || "left",
                textBaseline  : opt.context.textBaseline   || "top",
                arcScaleX_    : opt.context.arcScaleX_     || null,
                arcScaleY_    : opt.context.arcScaleY_     || null,
                lineScale_    : opt.context.lineScale_     || null,
                globalCompositeOperation : opt.context.globalCompositeOperation || "source-over"
            };

            _contextATTRS = _.extend( _contextATTRS , _context2D_context );

            //然后看继承者是否有提供_context 对象 需要 我 merge到_context2D_context中去的
            if (self._context) {
                _contextATTRS = _.extend(_contextATTRS , self._context );
            }

            //有些引擎内部设置context属性的时候是不用上报心跳的，比如做hitTestPoint热点检测的时候
            self._notWatch = false;

            _contextATTRS.$owner = self;
            _contextATTRS.$watch = function(name , value , preValue){

                //下面的这些属性变化，都会需要重新组织矩阵属性_transform 
                var transFormProps = [ "x" , "y" , "scaleX" , "scaleY" , "rotation" , "scaleOrigin" , "rotateOrigin" ];

                if( _.indexOf( transFormProps ) , name  ) {
                    this.$owner._updateTransform();
                }

                if(this.$owner._notWatch){
                    return;
                };

                if(this.$owner.$watch){
                   this.$owner.$watch( name , value , preValue );
                }

                //TODO 暂时所有的属性都上报，有时间了在来慢慢梳理
                var stage = this.$owner.getStage(); 

                if(stage.stageRending){
                    //如果这个时候stage正在渲染中，嗯。那么所有的 attrs的 set 都忽略
                    //TODO：先就这么处理，如果后续发现这些忽略掉的set，会影响到渲染，那么就在
                    //考虑加入 在这里加入设置下一step的心跳的机制
                    return
                };

                //stage存在，才说self代表的display已经被添加到了displayList中，绘图引擎需要知道其改变后
                //的属性，所以，通知到stage.displayAttrHasChange
                this.$owner.heartBeat( {
                    convertType:"context",
                    shape   : this.$owner,
                    name    : name,
                    value   : value,
                    preValue: preValue
                });
            };

            //执行init之前，应该就根据参数，把context组织好线
            self.context = propertyFactory( _contextATTRS );

        },
        /* @myself 是否生成自己的镜像 
         * 克隆又两种，一种是镜像，另外一种是绝对意义上面的新个体
         * 默认为绝对意义上面的新个体，新对象id不能相同
         * 镜像基本上是框架内部在实现  镜像的id相同 主要用来把自己画到另外的stage里面，比如
         * mouseover和mouseout的时候调用*/
        clone:function(myself){
            var newObj = new this.constructor({
                id      : this.id,
                context : this.context.$model
            });
            if (!myself){
                newObj.id       = Base.createId(newObj.type);
            }
            return newObj;

            /*
            var newObj = _.clone(this);
            newObj.parent = null;
            newObj.stage  = null;
            
            
            //newObj.context= propertyFactory(this.context.$model);
            if(!myself){
              //新对象的id不能相同
              newObj.id             = Base.createId(newObj.type);
              newObj._eventId       = newObj.id;
              newObj.context        = propertyFactory(this.context.$model);
              newObj.context.$owner = newObj;
              newObj.context.$watch = this.context.$watch;
            }
            return newObj;
            */
        },
        heartBeat : function(opt){
           this._heartBeatNum ++;
           var stage = this.getStage();
           stage.heartBeat && stage.heartBeat(opt);
        },
        getCurrentWidth : function(){
           return Math.abs(this.context.width * this.context.scaleX);
        },
        getCurrentHeight : function(){
	       return Math.abs(this.context.height * this.context.scaleY);
        },
        getStage : function(){
            if(this.stage) {
                return this.stage;
            }
            var p = this;
            if (p.type != "stage"){
              while(p.parent) {
                p = p.parent;
                if (p.type == "stage"){
                  break;
                }
              };
  
              if (p.type !== "stage") {
                //如果得到的顶点display 的type不是Stage,也就是说不是stage元素
                //那么只能说明这个p所代表的顶端display 还没有添加到displayList中，也就是没有没添加到
                //stage舞台的childen队列中，不在引擎渲染范围内
                return false;
              }
            } 
           
            //一直回溯到顶层object， 即是stage， stage的parent为null
            this.stage = p;
            return p;
            
        },
        localToGlobal : function( point ){
            !point && ( point = new Point( 0 , 0 ) );
            var cm = this.getConcatenatedMatrix();

            if (cm == null) return Point( 0 , 0 );
            var m = new Matrix(1, 0, 0, 1, point.x , point.y);
            m.concat(cm);
            return new Point( m.tx , m.ty ); //{x:m.tx, y:m.ty};
        },
        globalToLocal : function( point ) {
            !point && ( point = new Point( 0 , 0 ) );

            var cm = this.getConcatenatedMatrix();

            if (cm == null) return new Point( 0 , 0 ); //{x:0, y:0};
            cm.invert();
            var m = new Matrix(1, 0, 0, 1, point.x , point.y);
            m.concat(cm);
            return new Point( m.tx , m.ty ); //{x:m.tx, y:m.ty};
        },
        localToTarget : function( point , target){
            var p = localToGlobal( point );
            return target.globalToLocal( p );
        },
        getConcatenatedMatrix : function(){
            var cm = new Matrix();
            for (var o = this; o != null; o = o.parent) {
                cm.concat( o._transform );
                if( !o.parent || ( o.parent && o.parent.type=="stage" ) ) {
                    break;
                }
            }
            return cm;
        },
        /*
         *设置元素的是否响应事件检测
         *@bool  Boolean 类型
         */
        setEventEnable : function( bool ){
            if(_.isBoolean(bool)){
                this._eventEnabled = bool
                return true;
            };
            return false;
        },
        /*
         *查询自己在parent的队列中的位置
         */
        getIndex   : function(){
           if(!this.parent) {
             return;
           };
           return _.indexOf(this.parent.children , this)

        },
        /*
         *元素在z轴方向向下移动
         *@num 移动的层级
         */
        toBack : function( num ){
           if(!this.parent) {
             return;
           }
           var fromIndex = this.getIndex();
           var toIndex = 0;
           
           if(_.isNumber( num )){
             if( num == 0 ){
                //原地不动
                return;
             };
             toIndex = fromIndex - num;
           }
           var me = this.parent.children.splice( fromIndex , 1 )[0];
           if( toIndex < 0 ){
               toIndex = 0;
           };
           this.parent.addChildAt( me , toIndex );
        },
        /*
         *元素在z轴方向向上移动
         *@num 移动的层数量 默认到顶端
         */
        toFront : function( num ){

           if(!this.parent) {
             return;
           }
           var fromIndex = this.getIndex();
           var pcl = this.parent.children.length;
           var toIndex = pcl;
           
           if(_.isNumber( num )){
             if( num == 0 ){
                //原地不动
                return;
             }
             toIndex = fromIndex + num + 1;
           }
           var me = this.parent.children.splice( fromIndex , 1 )[0];
           if(toIndex > pcl){
               toIndex = pcl;
           }
           this.parent.addChildAt( me , toIndex-1 );
        },
        _transformHander : function(context, toGlobal){

            var transForm = this._transform;
            if( !transForm ) {
                transForm = this._updateTransform();
            }

            //运用矩阵开始变形
            context.transform.apply( context , transForm.toArray() );
 
            //设置透明度
            context.globalAlpha *= this.context.alpha;
        },
        //从一个矩阵公式来反推x,y ,scalce, rotate等属性到 obj的context上面
        _setPositionFromMatrix : function( Matrix ){
            this.context.x      = Matrix.tx;
            this.context.y      = Matrix.ty;
            this.context.scaleX = Matrix.a ;
            this.context.scaleY = Matrix.d ;

        },
        _updateTransform : function() {
            
            
            //var _transform = this._transform || new Matrix();
            //

            var _transform = new Matrix();

            _transform.identity();

            //是否需要Transform
            if(this.context.scaleX !== 1 || this.context.scaleY!==1){
                //如果有缩放
                //缩放的原点坐标
                var origin = new Point(this.context.scaleOrigin);
                if( origin.x || origin.y ){
                    _transform.translate( -origin.x , -origin.y );
                }
                _transform.scale( this.context.scaleX , this.context.scaleY );
                if( origin.x || origin.y ){
                    _transform.translate( origin.x , origin.y );
                };
            };

            var rotation = this.context.rotation;
            if( rotation ){
                //如果有旋转
                //旋转的原点坐标
                var origin = new Point(this.context.rotateOrigin);
                if( origin.x || origin.y ){
                    _transform.translate( -origin.x , -origin.y );
                }
                _transform.rotate( rotation % 360 * Math.PI/180 );
                if( origin.x || origin.y ){
                    _transform.translate( origin.x , origin.y );
                }
            };
            
            if(this.context.x!=0 || this.context.y!=0){
               //如果有位移
               _transform.translate( this.context.x , this.context.y );
            }

            this._transform = _transform;

            return _transform;
        },
        getRect:function(style){
            return style
        },
        //显示对象的选取检测处理函数
        getChildInPoint : function( point ){
            var result; //检测的结果

            //第一步，吧glob的point转换到对应的obj的层级内的坐标系统
            if( this.type != "stage" && this.parent && this.parent.type != "stage" ) {
                point = this.parent.globalToLocal( point );
            }

            var x = point.x ;
            var y = point.y ;

            //这个时候如果有对context的set，告诉引擎不需要watch，因为这个是引擎触发的，不是用户
            //用户set context 才需要触发watch
            this._notWatch = true;
        
            //对鼠标的坐标也做相同的变换
            if( this._transform ){
                var inverseMatrix = this._transform.clone().invert();

                var originPos = [x, y];
                inverseMatrix.mulVector( originPos , [ x , y , 1 ] );

               
                x = originPos[0];
                y = originPos[1];
            }

            // 快速预判并保留判断矩形
            //if(!this._rect) {
                //如果没有图像的_rect
                this._rect = this.getRect(this.context);
                if(!this._rect){
                   return false;
                };
                if( !this.context.width && !!this._rect.width ){
                    this.context.width = this._rect.width;
                }
                if( !this.context.height && !!this._rect.height ){
                    this.context.height = this._rect.height;
                }
            //};

            if(!this._rect.width || !this._rect.height) {
                return false;
            }

            //正式开始第一步的矩形范围判断
            if (x >= this._rect.x
                && x <= (this._rect.x + this._rect.width)
                && y >= this._rect.y
                && y <= (this._rect.y + this._rect.height)
            ) {
               //那么就在这个元素的矩形范围内
               //return true;
               result = HitTestPoint.isInside( this , x , y );
            } else {
               //如果连矩形内都不是，那么肯定的，这个不是我们要找的shap
               result = false;
            }
            this._notWatch = false;

            return result;

        },
        _render : function(context, noTransform, globalTransform){	
            if(!this.context.visible || this.context.alpha <= 0){
                return;
            }
            context.save();
            if(!noTransform) {
                this._transformHander(context, globalTransform);
            }
            this.render(context);
            context.restore();
        },
        render : function(context) {
            //基类不提供render的具体实现，由后续具体的派生类各自实现
        },
        //从树中删除
        remove : function(){
            if( this.parent ){
                this.parent.removeChild(this);
            }
        },
        //元素的自我销毁
        destroy : function(){
            this.remove();

            //把自己从父节点中删除了后做自我清除，释放内存
            this.context = null;
            delete this.context;

        },
        toString : function(){
            var result;
            
            if (!this.parent) {
              return this.id+"(stage)";
            }
            for(var o = this ; o != null; o = o.parent) {		
                //prefer id over name if specified
                var s = o.id+"("+ o.type +")";
                result = result == null ? s : (s + "-->" + result);
                if (o == o.parent || !o.parent) break;
            }

            return result; 
        }

    } );

    return DisplayObject;

} , {
    requires : [
      "canvax/event/EventDispatcher",
      "canvax/geom/Matrix",
      "canvax/display/Point",
      "canvax/core/Base",
      "canvax/utils/HitTestPoint",
      "canvax/core/propertyFactory"
    ]
});
