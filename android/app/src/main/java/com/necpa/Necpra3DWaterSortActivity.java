package com.necpa;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.Random;

public final class Necpra3DWaterSortActivity extends Activity {
    private WaterSort3DView game;
    private TextView movesView, scoreView, coinsView, statusView;
    private int level, coins;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(1024,1024);
        hideSystemBars();
        level=Math.max(1,getIntent().getIntExtra("level",1));
        coins=getSharedPreferences("necpra_3d_games",MODE_PRIVATE).getInt("coins",1200);
        FrameLayout root=new FrameLayout(this);
        game=new WaterSort3DView(this,level,new WaterSort3DView.Listener(){
            public void onState(int moves,int score,boolean solved,boolean stuck){
                movesView.setText("MOVES "+moves); scoreView.setText("SCORE "+score);
                if(solved){int reward=35+level*5;coins+=reward;getSharedPreferences("necpra_3d_games",0).edit().putInt("coins",coins).apply();coinsView.setText("🪙 "+coins);statusView.setText("LEVEL COMPLETE • +"+reward+" COINS");vibrate(80);}
                else statusView.setText(stuck?"NO LEGAL MOVE • USE UNDO OR HINT":game.isPaused()?"PAUSED":"TAP A TUBE, THEN ANOTHER");
            }
            public void feedback(){vibrate(18);}
        });
        root.addView(game,new FrameLayout.LayoutParams(-1,-1));

        LinearLayout hud=new LinearLayout(this);hud.setGravity(Gravity.CENTER_VERTICAL);hud.setPadding(dp(10),dp(7),dp(10),0);
        TextView title=label("WATER SORT 3D",16,Color.WHITE);hud.addView(title,new LinearLayout.LayoutParams(0,dp(48),1));
        movesView=label("MOVES 0",10,Color.WHITE);hud.addView(movesView,small());
        scoreView=label("SCORE 0",10,Color.WHITE);hud.addView(scoreView,small());
        coinsView=label("🪙 "+coins,10,Color.rgb(255,215,90));hud.addView(coinsView,small());
        root.addView(hud,top());

        statusView=label("TAP A TUBE, THEN ANOTHER",11,Color.rgb(175,190,220));statusView.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,dp(38),Gravity.BOTTOM);sp.bottomMargin=dp(70);root.addView(statusView,sp);

        LinearLayout controls=new LinearLayout(this);controls.setGravity(Gravity.CENTER);controls.setPadding(dp(8),0,dp(8),dp(10));
        controls.addView(btn("↶",v->game.undo()),cp());controls.addView(btn("💡",v->game.hint()),cp());controls.addView(btn("↻",v->game.restart()),cp());controls.addView(btn("Ⅱ",v->{game.togglePause();}),cp());controls.addView(btn("EXIT",v->finish()),cp());
        root.addView(controls,bottom());
        setContentView(root);
    }

    private void hideSystemBars(){if(android.os.Build.VERSION.SDK_INT>=30){WindowInsetsController c=getWindow().getInsetsController();if(c!=null)c.hide(WindowInsets.Type.statusBars()|WindowInsets.Type.navigationBars());}else getWindow().getDecorView().setSystemUiVisibility(5894);}
    private TextView label(String s,int z,int c){TextView v=new TextView(this);v.setText(s);v.setTextSize(z);v.setTextColor(c);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private LinearLayout.LayoutParams small(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,dp(48));p.setMargins(dp(2),0,dp(2),0);return p;}
    private FrameLayout.LayoutParams top(){return new FrameLayout.LayoutParams(-1,dp(56),Gravity.TOP);}
    private FrameLayout.LayoutParams bottom(){return new FrameLayout.LayoutParams(-1,dp(62),Gravity.BOTTOM);}
    private LinearLayout.LayoutParams cp(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(50),1);p.setMargins(dp(2),0,dp(2),0);return p;}
    private Button btn(String s,View.OnClickListener l){Button b=new Button(this);b.setText(s);b.setTextColor(Color.WHITE);b.setTextSize(11);b.setAllCaps(false);GradientDrawable d=new GradientDrawable();d.setColor(Color.rgb(24,35,64));d.setCornerRadius(dp(15));d.setStroke(dp(1),Color.argb(55,255,255,255));b.setBackground(d);b.setOnClickListener(l);return b;}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private void vibrate(long ms){try{Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);if(v!=null){if(android.os.Build.VERSION.SDK_INT>=26)v.vibrate(VibrationEffect.createOneShot(ms,VibrationEffect.DEFAULT_AMPLITUDE));else v.vibrate(ms);}}catch(Throwable ignored){}}
    @Override public void onBackPressed(){if(game.isPaused()){finish();return;}game.togglePause();statusView.setText("PAUSED • BACK AGAIN TO EXIT");}
}

final class WaterSort3DView extends android.opengl.GLSurfaceView {
    interface Listener{void onState(int moves,int score,boolean solved,boolean stuck);void feedback();}
    private final WaterSortRenderer renderer;private final Listener listener;private final Deque<int[][]> history=new ArrayDeque<>();
    private int[][] tubes;private int selected=-1,moves,score,level;private boolean paused,solved;private long lastTap;
    WaterSort3DView(Context c,int lvl,Listener l){super(c);level=lvl;listener=l;setEGLContextClientVersion(2);tubes=makeLevel(level);renderer=new WaterSortRenderer(tubes,()->invalidate());setRenderer(renderer);setRenderMode(RENDERMODE_CONTINUOUSLY);}
    boolean isPaused(){return paused;} void togglePause(){paused=!paused;renderer.paused=paused;invalidate();}
    void restart(){tubes=makeLevel(level);selected=-1;moves=0;score=0;solved=false;history.clear();renderer.setTubes(tubes);state(false);}
    void undo(){if(history.isEmpty()||paused||solved)return;tubes=history.pop();selected=-1;moves=Math.max(0,moves-1);score=Math.max(0,score-8);renderer.setTubes(tubes);listener.feedback();state(false);}
    void hint(){if(paused||solved)return;int[] m=findMove();if(m==null){state(true);return;}selected=m[0];renderer.selected=m[0];renderer.hintTarget=m[1];listener.feedback();invalidate();}
    private void state(boolean stuck){listener.onState(moves,score,solved,stuck);}
    @Override public boolean onTouchEvent(MotionEvent e){if(e.getAction()!=MotionEvent.ACTION_UP||paused||solved)return true;if(System.currentTimeMillis()-lastTap<90)return true;lastTap=System.currentTimeMillis();int i=renderer.hit(e.getX(),e.getY(),getWidth(),getHeight());if(i<0)return true;if(selected<0){if(tubes[i].length==0)return true;selected=i;renderer.selected=i;listener.feedback();invalidate();return true;}if(selected==i){selected=-1;renderer.selected=-1;invalidate();return true;}if(canPour(tubes[selected],tubes[i])){history.push(copy(tubes));pour(selected,i);selected=-1;renderer.selected=-1;renderer.hintTarget=-1;moves++;score+=10;listener.feedback();solved=isSolved();state(false);}else{listener.feedback();if(findMove()==null)state(true);}return true;}
    private void pour(int a,int b){int[] A=tubes[a],B=tubes[b],na,nb;int c=A[A.length-1],n=0;for(int i=A.length-1;i>=0&&A[i]==c;i--)n++;n=Math.min(n,4-B.length);na=Arrays.copyOf(A,A.length-n);nb=Arrays.copyOf(B,B.length+n);for(int k=0;k<n;k++)nb[B.length+k]=c;tubes[a]=na;tubes[b]=nb;renderer.setTubes(tubes);}
    private boolean canPour(int[] a,int[] b){return a.length>0&&b.length<4&&(b.length==0||a[a.length-1]==b[b.length-1]);}
    private boolean isSolved(){for(int[] t:tubes)if(t.length>0){for(int i=1;i<t.length;i++)if(t[i]!=t[0])return false;if(t.length!=4)return false;}return true;}
    private int[] findMove(){for(int a=0;a<tubes.length;a++)for(int b=0;b<tubes.length;b++)if(a!=b&&canPour(tubes[a],tubes[b]))return new int[]{a,b};return null;}
    private int[][] copy(int[][] x){int[][] y=new int[x.length][];for(int i=0;i<x.length;i++)y[i]=Arrays.copyOf(x[i],x[i].length);return y;}
    private int[][] makeLevel(int lvl){int colors=Math.min(7,3+(lvl-1)/3),n=colors+2;int[] p=new int[colors*4];int z=0;for(int c=0;c<colors;c++)for(int j=0;j<4;j++)p[z++]=c;Random r=new Random(0x4E435052L+lvl*7919L);for(int i=p.length-1;i>0;i--){int j=r.nextInt(i+1),q=p[i];p[i]=p[j];p[j]=q;}int[][] o=new int[n][];for(int i=0;i<colors;i++)o[i]=new int[]{p[i*4],p[i*4+1],p[i*4+2],p[i*4+3]};for(int i=colors;i<n;i++)o[i]=new int[0];return o;}
}

final class WaterSortRenderer implements android.opengl.GLSurfaceView.Renderer {
    private final Runnable tick;private int[][] tubes;int selected=-1,hintTarget=-1;boolean paused;private final float[] vp=new float[16],proj=new float[16],view=new float[16];private int program,aPos,uMvp,uColor;private java.nio.FloatBuffer cube;
    private final float[][] pos={{-2.4f,0,0},{-.8f,0,0},{.8f,0,0},{2.4f,0,0},{-1.6f,0,-2},{0,0,-2},{1.6f,0,-2},{0,0,-4}};
    WaterSortRenderer(int[][] t,Runnable r){tubes=t;tick=r;float[] v={-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1,-1,-1,-1,-1,1,-1,-1,1,-1,1,1,-1,1,-1,1,1,-1,1,1,1,1,1,1,-1,1,1,-1,-1,-1,1,-1,-1,1,-1,1,-1,1,1,-1,-1,-1,-1,-1,1,-1,1,1,1,1,-1,1,1,-1,-1,1,-1,1,-1,-1,1,1,1,1,1,1,-1,1,1,-1,-1,-1,1,-1,-1,1,1,-1,1,1,1,-1,1};cube=java.nio.ByteBuffer.allocateDirect(v.length*4).order(java.nio.ByteOrder.nativeOrder()).asFloatBuffer();cube.put(v).position(0);}
    void setTubes(int[][] t){tubes=t;}
    public void onSurfaceCreated(javax.microedition.khronos.egl.EGLConfig c){String vs="attribute vec3 aPos;uniform mat4 uMvp;void main(){gl_Position=uMvp*vec4(aPos,1.0);}";String fs="precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}";program=build(vs,fs);aPos=android.opengl.GLES20.glGetAttribLocation(program,"aPos");uMvp=android.opengl.GLES20.glGetUniformLocation(program,"uMvp");uColor=android.opengl.GLES20.glGetUniformLocation(program,"uColor");android.opengl.GLES20.glEnable(android.opengl.GLES20.GL_DEPTH_TEST);}
    public void onSurfaceChanged(javax.microedition.khronos.opengles.GL10 g,int w,int h){android.opengl.GLES20.glViewport(0,0,w,h);android.opengl.Matrix.perspectiveM(proj,0,45,(float)w/h,.1f,100); }
    public void onDrawFrame(javax.microedition.khronos.opengles.GL10 g){android.opengl.GLES20.glClearColor(.025f,.04f,.095f,1);android.opengl.GLES20.glClear(android.opengl.GLES20.GL_COLOR_BUFFER_BIT|android.opengl.GLES20.GL_DEPTH_BUFFER_BIT);android.opengl.Matrix.setLookAtM(view,0,0,3.1f,7.2f,0,0,0,0,1,0);android.opengl.Matrix.multiplyMM(vp,0,proj,0,view,0);box(0,-2.1f,-1.5f,7.2f,.08f,5.8f,new float[]{.06f,.10f,.19f,1});for(int i=0;i<tubes.length;i++)tube(i);tick.run();}
    private void tube(int i){float[] p=pos[i];box(p[0],-.1f,p[2],.84f,3.0f,.84f,new float[]{.10f,.20f,.36f,.32f});int[] t=tubes[i];for(int j=0;j<t.length;j++)box(p[0],-1.55f+j*.72f,p[2],.63f,.65f,.63f,col(t[j]));if(i==selected)box(p[0],1.48f,p[2],.98f,.06f,.98f,new float[]{.45f,.55f,1,1});if(i==hintTarget)box(p[0],-2.02f,p[2],.98f,.05f,.98f,new float[]{.25f,1,.75f,1});}
    private float[] col(int c){float[][] x={{.12f,.85f,.42f,1},{.18f,.55f,1,1},{1,.45f,.15f,1},{1,.20f,.34f,1},{1,.82f,.12f,1},{.65f,.35f,1,1},{.12f,.85f,.78f,1}};return x[c%x.length];}
    private void box(float x,float y,float z,float sx,float sy,float sz,float[] c){android.opengl.Matrix.setIdentityM(view,0);android.opengl.Matrix.translateM(view,0,x,y,z);android.opengl.Matrix.scaleM(view,0,sx,sy,sz);float[] m=new float[16];android.opengl.Matrix.multiplyMM(m,0,vp,0,view,0);android.opengl.GLES20.glUseProgram(program);android.opengl.GLES20.glUniformMatrix4fv(uMvp,1,false,m,0);android.opengl.GLES20.glUniform4fv(uColor,1,c,0);cube.position(0);android.opengl.GLES20.glEnableVertexAttribArray(aPos);android.opengl.GLES20.glVertexAttribPointer(aPos,3,android.opengl.GLES20.GL_FLOAT,false,0,cube);android.opengl.GLES20.glDrawArrays(android.opengl.GLES20.GL_TRIANGLES,0,36);android.opengl.GLES20.glDisableVertexAttribArray(aPos);}
    int hit(float x,float y,int w,int h){int cols=tubes.length<=4?tubes.length:4;int row=y<h*.50f?0:1;int col=Math.min(cols-1,Math.max(0,(int)(x/(w/(float)cols))));int i=row*cols+col;return y<h*.16f||y>h*.84f||i>=tubes.length?-1:i;}
    private int build(String vs,String fs){int v=android.opengl.GLES20.glCreateShader(android.opengl.GLES20.GL_VERTEX_SHADER);android.opengl.GLES20.glShaderSource(v,vs);android.opengl.GLES20.glCompileShader(v);int f=android.opengl.GLES20.glCreateShader(android.opengl.GLES20.GL_FRAGMENT_SHADER);android.opengl.GLES20.glShaderSource(f,fs);android.opengl.GLES20.glCompileShader(f);int p=android.opengl.GLES20.glCreateProgram();android.opengl.GLES20.glAttachShader(p,v);android.opengl.GLES20.glAttachShader(p,f);android.opengl.GLES20.glLinkProgram(p);return p;}
}
